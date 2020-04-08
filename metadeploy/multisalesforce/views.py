import json
import logging
import re

import requests
from allauth.socialaccount.providers.oauth2.views import (
    OAuth2CallbackView,
    OAuth2LoginView,
)
from allauth.socialaccount.providers.salesforce.views import (
    SalesforceOAuth2Adapter as SalesforceOAuth2BaseAdapter,
)
from allauth.utils import get_request_param
from django.core.exceptions import PermissionDenied, SuspiciousOperation
from sfdo_template_helpers.crypto import fernet_decrypt, fernet_encrypt

from metadeploy.api.constants import ORGANIZATION_DETAILS

from .provider import (
    SalesforceCustomProvider,
    SalesforceProductionProvider,
    SalesforceTestProvider,
)

logger = logging.getLogger(__name__)
ORGID_RE = re.compile(r"^00D[a-zA-Z0-9]{15}$")
CUSTOM_DOMAIN_RE = re.compile(r"^[a-zA-Z0-9.-]+$")


class SalesforcePermissionsError(PermissionDenied):
    pass


class SalesforceOAuth2Mixin:
    def get_org_details(self, extra_data, token):
        headers = {"Authorization": f"Bearer {token}"}

        # Confirm canModifyAllData:
        org_info_url = (extra_data["urls"]["rest"] + "connect/organization").format(
            version="44.0"
        )
        resp = requests.get(org_info_url, headers=headers)
        resp.raise_for_status()

        # Also contains resp.json()["name"], but not ["type"], so it's
        # insufficient to just call this endpoint.
        if not resp.json()["userSettings"]["canModifyAllData"]:
            raise SalesforcePermissionsError(
                "Error logging in: User does not have 'Modify All Data' Permission."
            )

        # Get org name and type:
        org_id = extra_data["organization_id"]
        self._validate_org_id(org_id)
        org_url = (extra_data["urls"]["sobjects"] + "Organization/{org_id}").format(
            version="44.0", org_id=org_id
        )
        resp = requests.get(org_url, headers=headers)
        resp_json = resp.json()
        if (
            resp.status_code == 403
            and len(resp_json) and resp_json[0]["errorCode"] == "API_DISABLED_FOR_ORG"
        ):
            raise SalesforcePermissionsError(
                "Sorry, MetaDeploy requires an org with the API enabled."
            )
        else:
            resp.raise_for_status()
        return resp_json

    def complete_login(self, request, app, token, **kwargs):
        token = fernet_decrypt(token.token)
        headers = {"Authorization": f"Bearer {token}"}
        verifier = request.session["socialaccount_state"][1]
        logger.info(
            "Calling back to Salesforce to complete login.",
            extra={"tag": "oauth", "context": {"verifier": verifier}},
        )
        resp = requests.get(self.userinfo_url, headers=headers)
        resp.raise_for_status()
        extra_data = resp.json()
        instance_url = kwargs.get("response", {}).get("instance_url", None)
        ret = self.get_provider().sociallogin_from_response(request, extra_data)
        ret.account.extra_data["instance_url"] = instance_url
        org_details = self.get_org_details(extra_data, token)
        ret.account.extra_data[ORGANIZATION_DETAILS] = org_details
        return ret

    def parse_token(self, data):
        """Wrap OAuth2Base.parse_token to encrypt tokens for storage.

        Called from OAuth2CallbackView"""
        data["access_token"] = fernet_encrypt(data["access_token"])
        data["refresh_token"] = fernet_encrypt(data["refresh_token"])
        return super().parse_token(data)

    def _validate_org_id(self, org_id):
        if not ORGID_RE.match(org_id):
            raise SuspiciousOperation("Invalid org Id")


class SalesforceOAuth2ProductionAdapter(
    SalesforceOAuth2Mixin, SalesforceOAuth2BaseAdapter
):
    provider_id = SalesforceProductionProvider.id


class SalesforceOAuth2SandboxAdapter(
    SalesforceOAuth2Mixin, SalesforceOAuth2BaseAdapter
):
    provider_id = SalesforceTestProvider.id


class SalesforceOAuth2CustomAdapter(SalesforceOAuth2Mixin, SalesforceOAuth2BaseAdapter):
    provider_id = SalesforceCustomProvider.id

    @property
    def base_url(self):
        custom_domain = self.request.GET.get(
            "custom_domain", self.request.session.get("custom_domain")
        )
        if not CUSTOM_DOMAIN_RE.match(custom_domain):
            raise SuspiciousOperation("Invalid custom domain")
        self.request.session["custom_domain"] = custom_domain
        return f"https://{custom_domain}.my.salesforce.com"


class LoggingOAuth2LoginView(OAuth2LoginView):
    def dispatch(self, request, *args, **kwargs):
        ret = super().dispatch(request, *args, **kwargs)

        verifier = request.session["socialaccount_state"][1]
        logger.info(
            "Dispatching OAuth login",
            extra={"tag": "oauth", "context": {"verifier": verifier}},
        )

        return ret


class LoggingOAuth2CallbackView(OAuth2CallbackView):
    def dispatch(self, request, *args, **kwargs):
        verifier = get_request_param(request, "state")
        logger.info(
            "Dispatching OAuth callback",
            extra={"tag": "oauth", "context": {"verifier": verifier}},
        )
        return super().dispatch(request, *args, **kwargs)


prod_oauth2_login = LoggingOAuth2LoginView.adapter_view(
    SalesforceOAuth2ProductionAdapter
)
prod_oauth2_callback = LoggingOAuth2CallbackView.adapter_view(
    SalesforceOAuth2ProductionAdapter
)
sandbox_oauth2_login = LoggingOAuth2LoginView.adapter_view(
    SalesforceOAuth2SandboxAdapter
)
sandbox_oauth2_callback = LoggingOAuth2CallbackView.adapter_view(
    SalesforceOAuth2SandboxAdapter
)
custom_oauth2_login = LoggingOAuth2LoginView.adapter_view(SalesforceOAuth2CustomAdapter)
custom_oauth2_callback = LoggingOAuth2CallbackView.adapter_view(
    SalesforceOAuth2CustomAdapter
)
