// A single container declared on a pod (upstream pod `data.containers` entry):
// its name and the image it runs. Carried on pod nodes by the backend, aggregated
// onto synthesized controllers by normalizeGraph (deduped by (name, image)), and
// rendered as one row per container in the node-detail Containers section.
export interface ContainerSpec {
  name: string;
  image: string;
}
