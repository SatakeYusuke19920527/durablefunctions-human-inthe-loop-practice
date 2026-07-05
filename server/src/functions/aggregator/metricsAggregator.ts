import * as df from "durable-functions";
import { EntityContext } from "durable-functions";

export interface MetricsState {
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  last: number | null;
}

const initialState = (): MetricsState => ({
  count: 0,
  sum: 0,
  min: null,
  max: null,
  last: null,
});

/**
 * Aggregator パターンの中核となる Durable Entity。
 *
 * 時間をまたいで届くイベント（数値）を1つの状態に「集約」し続ける。
 * オーケストレーターと違い、エンティティは**状態を保持**し、
 * signalEntity で送られる operation を1件ずつ直列に処理する（競合しない）。
 *
 * operations:
 *   - "add"   : 数値を1件加算（count/sum/min/max/last を更新）
 *   - "reset" : 集計をリセット
 */
const metricsAggregator = (context: EntityContext<MetricsState>): void => {
  const state = context.df.getState(initialState) as MetricsState;

  switch (context.df.operationName) {
    case "add": {
      const value = context.df.getInput<number>() ?? 0;
      state.count += 1;
      state.sum += value;
      state.min = state.min === null ? value : Math.min(state.min, value);
      state.max = state.max === null ? value : Math.max(state.max, value);
      state.last = value;
      context.df.setState(state);
      break;
    }
    case "reset": {
      context.df.setState(initialState());
      break;
    }
    default:
      // 未知の operation は無視
      break;
  }
};

df.app.entity("metricsAggregator", metricsAggregator);

export default metricsAggregator;
