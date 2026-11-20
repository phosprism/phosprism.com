import { mkdir, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import { loadDefaultJapaneseParser } from 'budoux';
import opentype from 'opentype.js';
import sharp from 'sharp';

/**
 * OGP画像が設定されていないページ用に、ページのタイトル入りのOGP画像を自動で作る。
 *
 * SiteLayout.astro は、image が指定されていないページの og:image を /ogp/{ページのパス}.png にする。
 * ビルド後に dist の全HTMLからその参照を集め、黒い背景・右下にサークルロゴ・左にタイトルの画像を書き出す。
 */

export const ogpImagePath = (pathname: string) => {
  const trimmed = pathname.replace(/^\/|\/$/g, '').replace(/\.html$/, '');
  return `/ogp/${trimmed || 'index'}.png`;
};

const WIDTH = 1200;
const HEIGHT = 630;
const BACKGROUND = '#070708';
const TEXT_COLOR = '#F4F3EF';
// 画像の周りに付ける白い枠（端からの距離と線の太さ）
const FRAME_INSET = 24;
const FRAME_WIDTH = 3;
const LOGO_HEIGHT = 110;
// 枠の内側に、枠との間をあけてロゴを置く
const LOGO_MARGIN = 60;
// ロゴはほぼ正方形なので、重なりの判定では幅も高さと同じとみなす
const LOGO_LEFT = WIDTH - LOGO_MARGIN - LOGO_HEIGHT;
const LOGO_TOP = HEIGHT - LOGO_MARGIN - LOGO_HEIGHT;
// タイトルとロゴのあいだに空ける間隔
const LOGO_CLEARANCE = 32;
const TEXT_SIDE = 80;
// タイトルは画像の上下中央に置き、上下に同じだけ余白をとる
const TEXT_TOP = 72;
const TEXT_BOTTOM = HEIGHT - TEXT_TOP;
const TEXT_WIDTH = WIDTH - TEXT_SIDE * 2;
const LINE_HEIGHT = 1.4;
const MAX_FONT_SIZE = 88;
const MIN_FONT_SIZE = 40;
// かっこの中を改行せずに収めるために、ここまでは文字を小さくしてよい
const BRACKET_KEEP_MIN_FONT_SIZE = 56;

const SITE_SUFFIX = / — Phos'Prism$/;

const root = new URL('../../', import.meta.url);
const fontPath = new URL('src/fonts/ogp/NotoSansJP-Bold.otf', root);
const logoPath = new URL('public/assets/logo.png', root);

// 「について」「に関する」などは前の語とつなげて、「サークルに／ついての」のように切らない
const ATTACH_TO_PREVIOUS =
  /^(?:つい[てた]|関し|関す|対し|対す|よる|より|よっ|おい[てた]|おけ|向け|際し|伴|とっ|わた[りっ]|沿っ|基づ)/;
// 行頭に来てはいけない文字（句読点・閉じかっこ・小書きの仮名など）
const NO_LINE_START =
  /^[、。，．,.・：:；;！!？?）)」』】〕〉》ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々〜～…]/;

const OPENING_BRACKET = /^[【「『（〔〈《［｛]/;
const CLOSING_PUNCTUATION = /[】」』）〕〉》］｝。、]$/;
// タイトルの先頭にある【〜】の見出し
const LEADING_LABEL = /^\s*【[^】]*】/;

const parser = loadDefaultJapaneseParser();

/** タイトルを、改行してよい位置ごとのかたまり（文節）に分ける */
export const splitPhrases = (title: string) => {
  const chunks = parser
    .parse(title)
    // 英語の部分は単語の区切り（空白）でも改行できるようにする
    .flatMap((chunk) => chunk.split(/(?<=\s)/))
    .filter(Boolean);

  const phrases: string[] = [];
  for (const chunk of chunks) {
    const previous = phrases.at(-1);
    if (previous && (ATTACH_TO_PREVIOUS.test(chunk) || NO_LINE_START.test(chunk))) {
      phrases[phrases.length - 1] = previous + chunk;
    } else {
      phrases.push(chunk);
    }
  }
  return phrases;
};

type Layout = { fontSize: number; lines: string[] };

/** 「」『』（）の中にある文節を1つにつなげ、かっこの中で改行しないようにする */
const joinBracketedPhrases = (phrases: string[]) => {
  const joined: string[] = [];
  let depth = 0;
  for (const phrase of phrases) {
    if (depth > 0) joined[joined.length - 1] += phrase;
    else joined.push(phrase);
    for (const char of phrase) {
      if ('「『（(【'.includes(char)) depth += 1;
      if ('」』）)】'.includes(char)) depth = Math.max(0, depth - 1);
    }
  }
  return joined;
};

/** 上下中央に置いたときの、タイトルのかたまりの上端 */
const blockTop = (lineCount: number, fontSize: number) =>
  (HEIGHT - fontSize * LINE_HEIGHT * lineCount) / 2;

/** 中央に並べた行のどれかが、右下のロゴ（と周りの間隔）にかかるか */
const overlapsLogo = (font: opentype.Font, lines: string[], fontSize: number) => {
  const lineHeight = fontSize * LINE_HEIGHT;
  const top = blockTop(lines.length, fontSize);
  return lines.some((line, index) => {
    const bottom = top + lineHeight * (index + 1);
    const right = (WIDTH + font.getAdvanceWidth(line, fontSize)) / 2;
    return bottom > LOGO_TOP - LOGO_CLEARANCE && right > LOGO_LEFT - LOGO_CLEARANCE;
  });
};

/** 文字の大きさを大きい順に試し、文節の区切りで改行して枠に収まる最大の大きさを選ぶ */
const layoutTitle = (font: opentype.Font, title: string): Layout => {
  // 先頭の【出演情報】などの見出しは、それだけで1行にする
  const label = title.match(LEADING_LABEL)?.[0].trim();
  const body = label ? title.slice(title.indexOf(label) + label.length).trim() : title;
  const labelLines = label ? [label] : [];
  const phrases = splitPhrases(body);
  const measure = (text: string, size: number) => font.getAdvanceWidth(text.trimEnd(), size);

  // まず「」などの中を改行しない分け方で、ある程度の大きさまで試す。
  // 収まらないときだけ、かっこの中でも改行してよいことにする
  const attempts = [
    { phrases: joinBracketedPhrases(phrases), minFontSize: BRACKET_KEEP_MIN_FONT_SIZE },
    { phrases, minFontSize: MIN_FONT_SIZE },
  ];
  for (const attempt of attempts) {
    for (let fontSize = MAX_FONT_SIZE; fontSize >= attempt.minFontSize; fontSize -= 2) {
      const maxLines = Math.floor((TEXT_BOTTOM - TEXT_TOP) / (fontSize * LINE_HEIGHT));
      if (label && measure(label, fontSize) > TEXT_WIDTH) continue;
      const bodyLines = breakLines(
        attempt.phrases,
        (text) => measure(text, fontSize),
        maxLines - labelLines.length,
      );
      if (!bodyLines) continue;
      const lines = [...labelLines, ...bodyLines];
      if (!overlapsLogo(font, lines, fontSize)) return { fontSize, lines };
    }
  }

  // 最小の大きさでも収まらない長いタイトルは、文字単位で折り返して最後を「…」で切る
  const fontSize = MIN_FONT_SIZE;
  const maxLines = Math.floor((TEXT_BOTTOM - TEXT_TOP) / (fontSize * LINE_HEIGHT));
  const lines: string[] = [...labelLines, ''];
  for (const char of body) {
    const current = lines[lines.length - 1];
    if (measure(current + char, fontSize) > TEXT_WIDTH) {
      if (lines.length === maxLines) {
        lines[lines.length - 1] = `${current.slice(0, -1)}…`;
        break;
      }
      lines.push(char);
    } else {
      lines[lines.length - 1] = current + char;
    }
  }
  return { fontSize, lines };
};

/**
 * 文節を行に分ける。行数が最も少なく、その中で各行の長さが最もそろう分け方を選ぶ。
 * 1つの文節が1行に収まらないときや、行数が上限を超えるときは null を返す。
 */
const breakLines = (
  phrases: string[],
  measure: (text: string) => number,
  maxLines: number,
): string[] | null => {
  if (phrases.some((phrase) => measure(phrase) > TEXT_WIDTH)) return null;

  const count = phrases.length;
  // best[i] = 先頭から i 個の文節を並べたときの最良の分け方
  const best: ({ lines: number; cost: number; previous: number } | undefined)[] = [
    { lines: 0, cost: 0, previous: -1 },
  ];
  for (let end = 1; end <= count; end += 1) {
    for (let start = end - 1; start >= 0; start -= 1) {
      const width = measure(phrases.slice(start, end).join(''));
      if (width > TEXT_WIDTH) break;
      const before = best[start];
      if (!before) continue;
      const lines = before.lines + 1;
      // 最後の行以外は、右の余りが少ないほどよい（行の長さをそろえる）
      const slack = end === count ? 0 : ((TEXT_WIDTH - width) / TEXT_WIDTH) ** 2;
      const cost = before.cost + slack;
      const current = best[end];
      if (!current || lines < current.lines || (lines === current.lines && cost < current.cost)) {
        best[end] = { lines, cost, previous: start };
      }
    }
  }

  const result = best[count];
  if (!result || result.lines > maxLines) return null;

  const lines: string[] = [];
  for (let end = count; end > 0; end = best[end]!.previous) {
    lines.unshift(phrases.slice(best[end]!.previous, end).join('').trim());
  }
  return lines;
};

const findHtmlFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_astro' || entry.name === 'assets' || entry.name === 'ogp') return [];
        return findHtmlFiles(fullPath);
      }
      return entry.name.endsWith('.html') ? [fullPath] : [];
    }),
  );
  return files.flat();
};

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 右下に置くサークルロゴ（元画像の左下にある小さな点は切り落とす） */
const createLogo = async () => {
  const source = sharp(fileURLToPath(logoPath));
  const { width = 512, height = 512 } = await source.metadata();
  const cropped = await sharp(fileURLToPath(logoPath))
    .extract({ left: 60, top: 0, width: width - 60, height })
    .png()
    .toBuffer();
  return sharp(cropped).trim().resize({ height: LOGO_HEIGHT }).png().toBuffer();
};

/**
 * 文字の形をSVGのパスにする。
 * opentype.js の toPathData(桁数) は丸めの不具合で一部の座標が NaN になり、その先が描かれないため、自前で書き出す
 */
const toPathData = (glyphPath: opentype.Path) => {
  const n = (value: number) => (Math.round(value * 100) / 100).toString();
  return glyphPath.commands
    .map((command) => {
      switch (command.type) {
        case 'M':
        case 'L':
          return `${command.type}${n(command.x)} ${n(command.y)}`;
        case 'Q':
          return `Q${n(command.x1)} ${n(command.y1)} ${n(command.x)} ${n(command.y)}`;
        case 'C':
          return `C${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}`;
        default:
          return 'Z';
      }
    })
    .join('');
};

const renderImage = async (font: opentype.Font, logo: Buffer, title: string) => {
  const { fontSize, lines } = layoutTitle(font, title);
  const lineHeight = fontSize * LINE_HEIGHT;
  // タイトルのかたまりを、画像の上下中央に置く
  const top = blockTop(lines.length, fontSize);
  const ascender = (font.ascender / font.unitsPerEm) * fontSize;
  const descender = (-font.descender / font.unitsPerEm) * fontSize;
  const halfLeading = (lineHeight - (ascender + descender)) / 2;

  // 文字はフォントの形（パス）として書き込むので、ビルドする環境のフォントに左右されない
  const paths = lines
    .map((line, index) => {
      const baseline = top + lineHeight * index + halfLeading + ascender;
      // 各行を左右中央に置く。【「（ で始まる行や 】」。で終わる行は、
      // かっこや句点の外側の余白（半角分）を除いた見た目の幅で中央をとる
      const leading = OPENING_BRACKET.test(line) ? fontSize / 2 : 0;
      const trailing = CLOSING_PUNCTUATION.test(line) ? fontSize / 2 : 0;
      const visibleWidth = font.getAdvanceWidth(line, fontSize) - leading - trailing;
      const left = (WIDTH - visibleWidth) / 2 - leading;
      return toPathData(font.getPath(line, left, baseline, fontSize));
    })
    .join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <title>${escapeXml(title)}</title>
  <rect x="${FRAME_INSET}" y="${FRAME_INSET}" width="${WIDTH - FRAME_INSET * 2}" height="${HEIGHT - FRAME_INSET * 2}" fill="none" stroke="${TEXT_COLOR}" stroke-width="${FRAME_WIDTH}"/>
  <path d="${paths}" fill="${TEXT_COLOR}"/>
</svg>`;

  const { width: logoWidth = LOGO_HEIGHT } = await sharp(logo).metadata();
  return sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: BACKGROUND },
  })
    .composite([
      { input: Buffer.from(svg), left: 0, top: 0 },
      {
        input: logo,
        left: WIDTH - LOGO_MARGIN - logoWidth,
        top: HEIGHT - LOGO_MARGIN - LOGO_HEIGHT,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

const loadFont = async () => {
  const fontFile = await readFile(fontPath);
  return opentype.parse(
    fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength),
  );
};

/**
 * タイトル入りの画像を作る関数を返す（フォントとロゴの読み込みは1回だけ）。
 * scripts/generate-news-ogp.mjs からも使う
 */
export const createTitleImageRenderer = async () => {
  const font = await loadFont();
  const logo = await createLogo();
  return (title: string) => renderImage(font, logo, title);
};

export const ogpImages = (): AstroIntegration => ({
  name: 'ogp-images',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const distDir = fileURLToPath(dir);
      // og:image が /ogp/... を指しているページと、そのタイトルを集める
      const targets = new Map<string, string>();
      for (const file of await findHtmlFiles(distDir)) {
        const html = await readFile(file, 'utf8');
        const image = html.match(
          /<meta property="og:image" content="[^"]*?(\/ogp\/[^"]+\.png)"/,
        )?.[1];
        if (!image) continue;
        const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
        if (!title) continue;
        targets.set(decodeURI(image), decodeEntities(title).replace(SITE_SUFFIX, ''));
      }

      const render = await createTitleImageRenderer();
      for (const [image, title] of targets) {
        const output = path.join(distDir, image);
        await mkdir(path.dirname(output), { recursive: true });
        await sharp(await render(title)).toFile(output);
      }
      logger.info(`${targets.size} ページのOGP画像を作りました`);
    },
  },
});
