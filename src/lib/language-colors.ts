// GitHub Linguist colors for common languages, plus a deterministic
// hash fallback so every language gets a stable, distinct dot color.

const LINGUIST: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f1e05a',
  python: '#3572a5',
  java: '#b07219',
  c: '#555555',
  'c++': '#f34b7d',
  'c#': '#178600',
  go: '#00add8',
  rust: '#dea584',
  ruby: '#701516',
  php: '#4f5d95',
  swift: '#f05138',
  kotlin: '#a97bff',
  dart: '#00b4ab',
  scala: '#c22d40',
  haskell: '#5e5086',
  lua: '#000080',
  elixir: '#6e4a7e',
  erlang: '#b83998',
  clojure: '#db5855',
  html: '#e34c26',
  css: '#563d7c',
  scss: '#c6538c',
  less: '#1d365d',
  shell: '#89e051',
  powershell: '#012456',
  dockerfile: '#384d54',
  makefile: '#427819',
  cmake: '#da3434',
  vue: '#41b883',
  svelte: '#ff3e00',
  astro: '#ff5a03',
  zig: '#ec915c',
  nim: '#ffc200',
  r: '#198ce7',
  matlab: '#e16737',
  'jupyter notebook': '#da5b0b',
  groovy: '#4298b8',
  'objective-c': '#438eff',
  perl: '#0298c3',
  ocaml: '#ef7a08',
  julia: '#a270ba',
  'f#': '#b845fc',
  elm: '#60b5cc',
  tex: '#3d6117',
  markdown: '#083fa1',
  json: '#8b919a',
  yaml: '#cb171e',
}

export function languageColor(name: string | null | undefined): string {
  if (!name) return '#8b919a'
  const direct = LINGUIST[name.toLowerCase()]
  if (direct) return direct

  // Deterministic fallback: hash the name into a hue.
  let hash = 0
  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0
  }
  return `hsl(${Math.abs(hash) % 360} 65% 62%)`
}
