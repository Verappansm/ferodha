/** What one dashboard panel knows about its own request. */
export interface PanelState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

export const LOADING: PanelState<never> = { loading: true, error: null, data: null };
