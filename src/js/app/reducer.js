// @flow

import { combineReducers } from 'redux';

import jobs from 'jobs/reducer';
import org from 'org/reducer';
import preflights from 'plans/reducer';
import products from 'products/reducer';
import user from 'user/reducer';

import type { CombinedReducer } from 'redux';
import type { JobsState } from 'jobs/reducer';
import type { Org } from 'org/reducer';
import type { PreflightsState } from 'plans/reducer';
import type { Products } from 'products/reducer';
import type { User } from 'user/reducer';

export type AppState = {
  +user: User,
  +products: Products,
  +preflights: PreflightsState,
  +jobs: JobsState,
  +org: Org,
};

type Action = { +type: string };

const reducer: CombinedReducer<AppState, Action> = combineReducers({
  user,
  products,
  preflights,
  jobs,
  org,
});

export default reducer;
