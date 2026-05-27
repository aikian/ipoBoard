import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { calculateScore } from './scoring.js';

const BASE_URL = 'https://www.38.co.kr';
const DEFAULT_LIST_URL = `${BASE_URL}/html/fund/?o=k`;

function clean(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyNumber(value) {
  const matched = clean(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return matched ? matched[0] : null;
}

function parseNo38(url) {
  const matched = String(url || '').match(/[?&]no=(\d+)/);
  return matched ? matched[1] : null;
}

function normalizeDate(dateText, fallbackYear = null) {
  const text = clean(dateText);
  const ymd = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  const md = text.match(/(\d{1,2})[.\-/](\d{1,2})/);
  if (md && fallbackYear) {
    return `${fallbackYear}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }

  return null;
}

function parseDateRange(value) {
  const text = clean(value);
  const match = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*~\s*(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return { start: normalizeDate(text), end: normalizeDate(text) };

  const startYear = match[1];
  const endYear = match[4] || startYear;

  return {
    start: `${startYear}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
    end: `${endYear}-${match[5].padStart(2, '0')}-${match[6].padStart(2, '0')}`
  };
}

function parsePriceBand(value) {
  const nums = clean(value).replace(/,/g, '').match(/\d+/g) || [];
  return {
    hopePriceMin: nums[0] || null,
    hopePriceMax: nums[1] || nums[0] || null
  };
}

function parseMoneyToEok(value) {
  const text = clean(value).replace(/,/g, '');
  if (!text) return null;

  const eok = text.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eok) return Number(eok[1]);

  const won = text.match(/(\d+(?:\.\d+)?)\s*원/);
  if (won) return Number(won[1]) / 100000000;

  const num = text.match(/\d+(?:\.\d+)?/);
  return num ? Number(num[0]) : null;
}

async function fetch38(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ipoBoard/1.0; +https://github.com/aikian/ipoBoard)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  const html = iconv.decode(Buffer.from(response.data), 'euc-kr');
  return cheerio.load(html);
}

function parseKeyValueTable($, selector) {
  const result = {};

  $(selector).find('tr').each((_, tr) => {
    const cells = $(tr)
      .find('th,td')
      .map((__, cell) => clean($(cell).text()))
      .get()
      .filter(Boolean);

    for (let i = 0; i < cells.length; i += 2) {
      const key = cells[i]?.replace(/[:：]$/, '');
      const value = cells[i + 1];
      if (key && value !== undefined) result[key] = value;
    }
  });

  return result;
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key]) return obj[key];
  }
  return null;
}

function extractDetailTables($) {
  return {
    overview: parseKeyValueTable($, 'table[summary="기업개요"]'),
    offering: parseKeyValueTable($, 'table[summary="공모정보"]'),
    schedule: parseKeyValueTable($, 'table[summary="공모청약일정"]')
  };
}

function inferFloatInfoFromBody($) {
  const body = clean($('body').text());
  const floatRatioMatch = body.match(/유통가능[^\d]{0,30}(\d+(?:\.\d+)?)\s*%/);
  const floatAmountMatch = body.match(/유통가능[^\d]{0,40}(\d+(?:\.\d+)?)\s*억/);
  const oldShareholderMatch = body.match(/기존\s*주주[^\d]{0,30}(\d+(?:\.\d+)?)\s*%/);

  return {
    floatRatio: floatRatioMatch ? floatRatioMatch[1] : null,
    floatAmount: floatAmountMatch ? floatAmountMatch[1] : null,
    existingShareholderRatio: oldShareholderMatch ? oldShareholderMatch[1] : null
  };
}

function normalizeDetail({ detailUrl, overview, offering, schedule, inferred }) {
  const subscriptionRange = parseDateRange(pick(schedule, ['공모청약일', '청약일', '청약일정']));
  const demandForecastRange = parseDateRange(pick(schedule, ['수요예측일', '수요예측']));
  const fixedPrice = pick(offering, ['확정공모가', '공모가', '확정공모가액']);
  const hopePrice = pick(offering, ['희망공모가액', '희망공모가', '공모희망가']);
  const band = parsePriceBand(hopePrice);

  return {
    no38: parseNo38(detailUrl),
    detailUrl,
    companyName: pick(overview, ['종목명', '회사명', '기업명']),
    sector: pick(overview, ['업종', '주요업종']),
    businessSummary: pick(overview, ['주요제품', '사업내용', '제품/서비스']),
    homepage: pick(overview, ['홈페이지']),
    ceo: pick(overview, ['대표이사', '대표자']),
    totalOfferingShares: pick(offering, ['총공모주식수']),
    listingOffering: pick(offering, ['상장공모']),
    fixedPrice: fixedPrice || null,
    hopePrice: hopePrice || null,
    ...band,
    offeringAmount: pick(offering, ['공모금액']),
    offeringAmountEok: parseMoneyToEok(pick(offering, ['공모금액'])),
    parValue: pick(offering, ['액면가']),
    underwriter: pick(offering, ['주간사', '대표주관사', '주관회사']),
    demandForecastText: pick(schedule, ['수요예측일', '수요예측']),
    demandForecastStart: demandForecastRange.start,
    demandForecastEnd: demandForecastRange.end,
    subscriptionText: pick(schedule, ['공모청약일', '청약일', '청약일정']),
    subscriptionStart: subscriptionRange.start,
    subscriptionEnd: subscriptionRange.end,
    allotmentDate: normalizeDate(pick(schedule, ['배정공고일'])),
    refundDate: normalizeDate(pick(schedule, ['환불일'])),
    paymentDate: normalizeDate(pick(schedule, ['납입일'])),
    listingDate: normalizeDate(pick(schedule, ['상장일', '상장예정일'])),
    institutionalCompetitionRate: pick(schedule, ['기관경쟁률', '수요예측경쟁률']),
    lockupRate: pick(schedule, ['의무보유확약', '의무확약', '확약']),
    floatRatio: inferred.floatRatio,
    floatAmount: inferred.floatAmount,
    existingShareholderRatio: inferred.existingShareholderRatio,
    source: '38comm',
    scrapedAt: new Date().toISOString()
  };
}

export async function scrapeIpoDetail(detailUrl) {
  const $ = await fetch38(detailUrl);
  const tables = extractDetailTables($);
  const inferred = inferFloatInfoFromBody($);
  return normalizeDetail({ detailUrl, ...tables, inferred });
}

export async function scrapeIpoList(page = 1, options = {}) {
  const { withDetails = true, limit = 20 } = options;
  const url = `${DEFAULT_LIST_URL}&page=${page}`;
  const $ = await fetch38(url);
  const rows = [];

  $('table[summary="공모주 청약일정"] tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    const a = tds.eq(0).find('a[href*="o=v"][href*="no="]').first();
    const href = a.attr('href');
    if (!href) return;

    const detailUrl = new URL(href, BASE_URL).href;
    const subscriptionText = clean(tds.eq(1).text());
    const range = parseDateRange(subscriptionText);
    const band = parsePriceBand(clean(tds.eq(3).text()));

    rows.push({
      no38: parseNo38(detailUrl),
      name: clean(tds.eq(0).text()),
      detailUrl,
      subscriptionText,
      subscriptionStart: range.start,
      subscriptionEnd: range.end,
      fixedPrice: clean(tds.eq(2).text()),
      hopePrice: clean(tds.eq(3).text()),
      ...band,
      competitionRate: clean(tds.eq(4).text()),
      underwriter: clean(tds.eq(5).text()),
      source: '38comm',
      scrapedAt: new Date().toISOString()
    });
  });

  if (!withDetails) {
    return rows.map((item) => ({ ...item, score: calculateScore(item) }));
  }

  const detailed = [];
  for (const item of rows.slice(0, limit)) {
    try {
      const detail = await scrapeIpoDetail(item.detailUrl);
      const merged = {
        ...item,
        ...detail,
        name: detail.companyName || item.name,
        underwriter: detail.underwriter || item.underwriter,
        fixedPrice: detail.fixedPrice || item.fixedPrice,
        hopePrice: detail.hopePrice || item.hopePrice,
        hopePriceMin: detail.hopePriceMin || item.hopePriceMin,
        hopePriceMax: detail.hopePriceMax || item.hopePriceMax
      };
      detailed.push({ ...merged, score: calculateScore(merged) });
    } catch (error) {
      detailed.push({ ...item, scrapeError: error.message, score: calculateScore(item) });
    }
  }

  return detailed;
}

export async function scrapeUpcomingIpos() {
  return scrapeIpoList(1, { withDetails: true, limit: 20 });
}
