import satori, { init } from "npm:satori/wasm";
import initYoga from "npm:yoga-wasm-web";
import { svg2png, initialize } from "npm:svg2png-wasm";

const importModule = (name: string) => {
  return fetch(new URL(`../../node_modules/${name}`, import.meta.url))
    .then((r) => r.arrayBuffer())
    .catch(() =>
      fetch(new URL(`../node_modules/${name}`, import.meta.url)).then((r) =>
        r.arrayBuffer()
      )
    );
};

let isInitialized = false;
const initializeSatori = async () => {
  if (isInitialized) return;
  isInitialized = true;
  const yogaWasm = await importModule("yoga-wasm-web/dist/yoga.wasm");
  init(await initYoga(yogaWasm));
  const svg2pngWasm = await importModule("svg2png-wasm/svg2png_wasm_bg.wasm");
  await initialize(svg2pngWasm);
};

type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type FontStyle = "normal" | "italic";
type FontSrc = {
  data: ArrayBuffer | string;
  name: string;
  weight?: Weight;
  style?: FontStyle;
  lang?: string;
};
type Font = Omit<FontSrc, "data"> & { data: ArrayBuffer };

const downloadFont = async (cache: Cache, fontName: string) => {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURI(fontName)}`;
  const response = await cache.match(url);
  if (response) {
    const data = await response.arrayBuffer();
    if (data.byteLength) return response.arrayBuffer();
  }
  const data = await fetch(url)
    .then((res) => res.text())
    .then(
      (css) =>
        css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/)?.[1]
    )
    .then((url) => {
      return url !== undefined
        ? fetch(url).then((v) =>
            v.status === 200 ? v.arrayBuffer() : undefined
          )
        : undefined;
    });
  if (data) {
    await cache.put(url, new Response(data));
  }
  return data;
};

const getFonts = async (fontList: string[], cache: Cache): Promise<Font[]> => {
  const fonts: Font[] = [];
  for (const fontName of fontList) {
    const data = await downloadFont(cache, fontName);
    if (data) {
      fonts.push({
        name: fontName,
        data,
        weight: 400,
        style: "normal",
      });
    }
  }
  return fonts.flatMap((v): Font[] => (v ? [v] : []));
};

const createLoadAdditionalAsset = ({
  cache,
  emojis,
}: {
  cache: Cache;
  emojis: {
    url: string;
    upper?: boolean;
  }[];
}) => {
  const getEmojiSVG = async (code: string) => {
    for (const { url, upper } of emojis) {
      const emojiURL = `${url}${
        upper === false ? code.toLocaleLowerCase() : code.toUpperCase()
      }.svg`;

      let response = await cache.match(emojiURL);
      if (!response) {
        response = await fetch(emojiURL);
        if (response.status === 200) {
          await cache.put(emojiURL, response.clone());
        }
      }
      if (response.status === 200) {
        return await response.text();
      }
    }
    return undefined;
  };

  const loadEmoji = (segment: string): Promise<string | undefined> => {
    const codes = Array.from(segment).map((char) => char.codePointAt(0)!);
    const isZero = codes.includes(0x200d);
    const code = codes
      .filter((code) => isZero || code !== 0xfe0f)
      .map((v) => v.toString(16))
      .join("-");
    return getEmojiSVG(code);
  };

  const loadAdditionalAsset = async (code: string, segment: string) => {
    if (code === "emoji") {
      const svg = await loadEmoji(segment);
      if (!svg) return segment;
      return `data:image/svg+xml;base64,${btoa(svg)}`;
    }
    return [];
  };

  return loadAdditionalAsset;
};

export const createOGP = async (
  element: JSX.Element,
  {
    fonts,
    emojis,
    cache,
    width,
    height,
    scale,
  }: {
    cache: Cache;
    fonts: string[];
    emojis?: {
      url: string;
      upper?: boolean;
    }[];
    width: number;
    height?: number;
    scale?: number;
  }
) => {
  await initializeSatori();
  const fontList = await getFonts(fonts, cache);
  const svg = await satori(element, {
    width,
    height,
    fonts: fontList,
    loadAdditionalAsset: emojis
      ? createLoadAdditionalAsset({ cache, emojis })
      : undefined,
  });
  return await svg2png(svg, { scale });
};
