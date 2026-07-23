// O corpus foi movido para @iacmp/knowledge (fonte única "corpus + retrieval +
// seed"), para que viaje embutido no bundle do CLI e chegue ao cliente npm.
// Este módulo agora só reexporta de lá — nada de corpus local.
export { ALL_EXAMPLES, getExampleById, type Example } from '@iacmp/knowledge';
