// @flow

import { createSelector } from 'reselect';

import type { AppState } from 'store';
import type { InitialProps } from 'components/utils';
import type { Plan as PlanType } from 'store/plans/reducer';
import type {
  Product as ProductType,
  ProductsState,
  Version as VersionType,
} from 'store/products/reducer';

export type ProductsMapType = Map<string, Array<ProductType>>;

export type VersionPlanType = {
  +label?: string | null,
  +slug?: string | null,
  +maybeVersion?: string,
  +maybeSlug?: string,
};

const transformList = (key, value) => {
  return { [key]: value };
};
const selectProductsState = (appState: AppState): ProductsState =>
  appState.products;

const selectProductsByCategory: AppState => ProductsMapType = createSelector(
  selectProductsState,
  (products: ProductsState): ProductsMapType => {
    const productsByCategory = new Map();
    for (const product of products.products) {
      if (
        product.is_allowed &&
        product.is_listed &&
        product.most_recent_version
      ) {
        const category = product.category;
        const existing = productsByCategory.get(category) || [];
        existing.push(product);
        productsByCategory.set(category, existing);
      }
    }
    return productsByCategory;
  },
);

const productCategories = (appState: AppState): ProductsState =>
  appState.products.categories;

const selectProductCategories: AppState => Array<string> = createSelector(
  productCategories,
  categories => {
    const list = categories.map(item => {
      return transformList(item.id, item.title);
    });
    const categoryList = { ...list };
    return categoryList;
  },
);
const productCount = (appState: AppState): ProductsState =>
  appState.products.categories;

const selectProductCount: AppState => Array<string> = createSelector(
  productCount,
  count => {
    const categoryIdCount = new Set();
    categoryIdCount.add(count);
    return categoryIdCount;
  },
);

const selectProductSlug = (
  appState: AppState,
  { match: { params } }: InitialProps,
): ?string => params.productSlug;

const selectProductNotFound: (
  AppState,
  InitialProps,
) => boolean = createSelector(
  [selectProductsState, selectProductSlug],
  (products: ProductsState, productSlug: ?string): boolean =>
    Boolean(productSlug && products.notFound.includes(productSlug)),
);

const selectProduct: (
  AppState,
  InitialProps,
) => ProductType | null | void = createSelector(
  [selectProductsState, selectProductSlug, selectProductNotFound],
  (
    products: ProductsState,
    productSlug: ?string,
    notFound: boolean,
  ): ProductType | null | void => {
    if (!productSlug) {
      return undefined;
    }
    const product = products.products.find(
      p => p.slug === productSlug || p.old_slugs.includes(productSlug),
    );
    if (product) {
      return product;
    }
    return notFound ? null : undefined;
  },
);

const selectVersionLabel = (
  appState: AppState,
  { match: { params } }: InitialProps,
): ?string => params.versionLabel;

const selectVersion: (
  AppState,
  InitialProps,
) => VersionType | null = createSelector(
  [selectProduct, selectVersionLabel],
  (
    product: ProductType | null | void,
    versionLabel: ?string,
  ): VersionType | null => {
    if (!product || !versionLabel) {
      return null;
    }
    if (
      product.most_recent_version &&
      product.most_recent_version.label === versionLabel
    ) {
      return product.most_recent_version;
    }
    if (product.versions && product.versions[versionLabel]) {
      return product.versions[versionLabel];
    }
    return null;
  },
);

const selectVersionLabelOrPlanSlug: (
  AppState,
  InitialProps,
) => VersionPlanType = createSelector(
  [selectProduct, selectVersion, selectVersionLabel],
  (
    product: ProductType | null | void,
    version: VersionType | null,
    maybeVersionLabel: ?string,
  ): VersionPlanType => {
    // There's a chance that the versionLabel is really a planSlug.
    // Check the most recent version in the product and see.
    if (!product || !maybeVersionLabel) {
      return { label: null, slug: null };
    }
    const { most_recent_version } = product;
    if (!version && most_recent_version) {
      const slugs = [];
      /* istanbul ignore else */
      if (most_recent_version.primary_plan) {
        slugs.push(most_recent_version.primary_plan.slug);
      }
      /* istanbul ignore else */
      if (most_recent_version.secondary_plan) {
        slugs.push(most_recent_version.secondary_plan.slug);
      }
      /* istanbul ignore else */
      if (most_recent_version.additional_plans) {
        // Add all slugs (current and old) from all known plans
        slugs.push(
          ...(Object.entries(most_recent_version.additional_plans): any)
            .filter((item: Array<[string, PlanType | null]>) => item[1])
            .map((item: Array<[string, PlanType]>) => item[0]),
        );
      }
      if (slugs.includes(maybeVersionLabel)) {
        return {
          label: most_recent_version.label,
          slug: maybeVersionLabel,
        };
      }
      if (
        !(
          most_recent_version.additional_plans &&
          most_recent_version.additional_plans[maybeVersionLabel] === null
        )
      ) {
        // Check to see if plan exists on version...
        return {
          maybeVersion: most_recent_version.id,
          maybeSlug: maybeVersionLabel,
        };
      }
    }
    return {
      label: maybeVersionLabel,
      slug: null,
    };
  },
);

export {
  selectProductsState,
  selectProductsByCategory,
  selectProductCategories,
  selectProductSlug,
  selectProduct,
  selectProductNotFound,
  selectVersionLabel,
  selectVersion,
  selectVersionLabelOrPlanSlug,
  selectProductCount,
};
