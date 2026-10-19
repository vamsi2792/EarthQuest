/** Dimensions of the default local model (all-MiniLM-L6-v2). The schema depends on this. */
export const EMBEDDING_DIM = 384;

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

type Extractor = (
  input: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | undefined;

/**
 * Free, key-less embeddings that run in-process via transformers.js.
 * The model (~25 MB) is downloaded once on first use and cached on disk.
 */
export const localEmbeddings: EmbeddingProvider = {
  async embed(texts) {
    extractorPromise ??= import("@xenova/transformers").then(
      ({ pipeline }) => pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2") as Promise<Extractor>,
    );
    const extractor = await extractorPromise;
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist();
  },
};

/** pgvector accepts vectors as a bracketed string literal. */
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;
