#!/usr/bin/env node
// Copy lint (docs/05 §6, §2.2, §6.4b; docs/06 4.2): fails the build when public text uses a
// forbidden phrase, an unused brand term, or names a competing project.
//
//   node tools/lint_copy.mjs              scan apps/web (src, content), docs/tweets
//   node tools/lint_copy.mjs --self-test  check the rules themselves
//
// Competitor names are stored as SHA-256 hashes (tools/copy_lint_names.json) so that this
// public repository does not name them either.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TARGETS = ['apps/web/src', 'apps/web/content', 'docs/tweets'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.md', '.mdx', '.txt', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', '__screenshots__']);

/** Approved sentences that contain an otherwise forbidden word (docs/05 §6.1 alternatives). */
const APPROVED = [
  // The slogan, also when markup splits it ("Not the moon. <span>The Moho.</span>")
  /not the moon\.(?=[^]{0,120}the moho\.)/g,
  /is it audited\?/g, // approved FAQ question; the answer is "Not yet"
  /is \$moho your token\?/g, // approved FAQ question (docs/05 §3.2 S11); the answer names $MOHN
  /there is no airdrop\.?/g,
  /no presale\.?/g,
  /nothing on this site is an offer, investment advice or a promise of value\.?/g,
  /returns? to the reserve/g,
  /unaudited/g,
];

/** [rule, regex] on lowercased text. */
const FORBIDDEN = [
  // Profit framing (§6.1)
  ['yield / returns', /\b(roi|apy|apr|yield|yields|real yield|returns|profit|profits|profitable)\b/],
  ['earn', /\bearn(s|ed|ing)?\b/],
  ['passive income', /\bpassive income\b|money while you sleep/],
  ['guarantee', /\bguarantee(d|s)?\b|\brisk[- ]free\b|safe investment/],
  ['audited (we are not)', /\baudited\b/],
  ['payback', /\bpayback\b|\bbreak[- ]even\b|pays for itself/],
  ['price talk', /price target|undervalued|\bpump(s|ing)?\b|\bfloor price\b/],
  ['listing', /listing soon|\bcex\b|exchange listing/],
  ['fomo', /\b100x\b|to the moon|\bmoon(ing)?\b|\bgem(s)?\b|early = rich|don'?t miss|last chance/],
  ['investment framing', /\binvest(ment|ments|or|ors|ing)?\b|\bholders\b|\bbags\b/],
  ['airdrop / claim', /\bairdrop(s)?\b|free tokens|\bclaim(s|ed|ing)?\b/],
  ['wallet phishing patterns', /verify (your )?wallet|\bsync\b|\brevoke\b|connect to claim/],
  ['presale', /\bpresale\b|\bwhitelist\b|private round/],
  ['x-to-earn', /\b(play|mine|drill)[- ]to[- ]earn\b/],
  ['profit sharing', /revenue share|\bdividend(s)?\b/],
  ['gambling', /\blotter(y|ies)\b|\bjackpot\b|\blucky\b|loot ?box|\bgacha\b|mystery box/],
  ['robinhood affiliation', /robinhood'?s game|powered by robinhood|official robinhood|partnered with robinhood/],
  // Unused brand terms (§2.2)
  ['brand: energy', /\benergy\b|\bkwh\b|\bkw\b|power plant|electricity/],
  ['brand: underground', /\boutpost\b|\bshaft\b|\btunnel\b|\bcave\b|\belevator\b|\bseam\b|\bvein\b|\bcrystal\b|\bpickaxe\b/],
  ['brand: old names', /world depth|\bsuperdeep\b|\$moho\b/],
];

const names = new Set(
  JSON.parse(readFileSync(join(ROOT, 'tools', 'copy_lint_names.json'), 'utf8')).sha256,
);
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Findings for one text: rule names with the matched words. `known`: name hashes to look for. */
export function lint(text, known = names) {
  // Collapse whitespace so an approved sentence wrapped over lines (JSX, MDX) still matches.
  let t = text.toLowerCase().replace(/\s+/g, ' ');
  for (const re of APPROVED) t = t.replace(re, ' ');
  const findings = [];
  for (const [rule, re] of FORBIDDEN) {
    const m = re.exec(t);
    if (m) findings.push(`${rule}: "${m[0]}"`);
  }
  const tokens = t.split(/[^a-z0-9_$@]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const one = tokens[i];
    const two = i + 1 < tokens.length ? `${one} ${tokens[i + 1]}` : null;
    for (const candidate of [one, one.replace(/^[@$]/, ''), two, two?.replace(' ', '')]) {
      if (candidate && known.has(sha(candidate))) {
        findings.push('competitor name (docs/05 §6.4b)');
        i = tokens.length;
        break;
      }
    }
  }
  return findings;
}

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (EXTENSIONS.has(extname(entry))) yield path;
  }
}

function selfTest() {
  const cases = [
    ['Your share of each hour is your Drill Power divided by everyone else.', 0],
    ['Not the moon. The Moho.', 0],
    ['There is no airdrop.', 0],
    ['No presale. No team buy. No premine.', 0],
    ['20% returns to the reserve.', 0],
    ['Unaudited. What we did instead.', 0],
    ['Earn 50 MOHN per day!', 1],
    ['Huge APY and passive income', 1],
    ['Claim your rewards', 1],
    ['to the moon', 1],
    ['Audited by experts', 1],
    ['Fill your outpost with energy', 1],
    ['Buy $MOHO now', 1],
    ['Powered by Robinhood', 1],
  ];
  // The name check, on a made-up rival (the real names are never written out here).
  const rival = new Set([sha('rivalgame'), sha('rival_rh')]);
  const nameCases = [
    ['Better than RivalGame', 1],
    ['unlike rival game or @rival_rh', 1],
    ['A game with no rival', 0],
  ];
  let failed = 0;
  const check = (text, expectFindings, known) => {
    const got = lint(text, known).length > 0 ? 1 : 0;
    if (got !== expectFindings) {
      failed += 1;
      console.error(`self-test: "${text}" expected ${expectFindings ? 'a finding' : 'clean'}`);
    }
  };
  for (const [text, expectFindings] of cases) check(text, expectFindings, names);
  for (const [text, expectFindings] of nameCases) check(text, expectFindings, rival);
  if (names.size === 0) {
    failed += 1;
    console.error('self-test: tools/copy_lint_names.json lists no names');
  }
  if (failed > 0) process.exit(1);
  console.log(`copy lint self-test: ${cases.length + nameCases.length} cases ok`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  let problems = 0;
  for (const target of TARGETS) {
    for (const file of files(join(ROOT, target))) {
      const findings = lint(readFileSync(file, 'utf8'));
      for (const f of findings) {
        problems += 1;
        console.error(`${relative(ROOT, file)}: ${f}`);
      }
    }
  }
  if (problems > 0) {
    console.error(`copy lint: ${problems} problem(s); see docs/05 §6 for approved wording`);
    process.exit(1);
  }
  console.log('copy lint: clean');
}
