/** Optional capabilities the Worker wires in (config.ts); tests opt in by setting the field. Absent = feature off. */
export interface FeatureDeps {
  /** fetch used for the live sea state (Open-Meteo Marine). Present = the season begin asks for the sea. */
  seaFetch?: typeof fetch;
}
