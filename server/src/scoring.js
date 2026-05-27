function num(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).replace(/,/g, '').replace(/%/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function calculateScore(ipo) {
  const competition = num(ipo.institutionalCompetitionRate || ipo.competitionRate);
  const lockup = num(ipo.lockupRate);
  const floatAmount = num(ipo.floatAmount);
  const floatRatio = num(ipo.floatRatio);
  const fixedPrice = num(ipo.fixedPrice);
  const hopeMax = num(ipo.hopePriceMax);

  let demandScore = 0;
  if (competition >= 1000) demandScore += 8;
  else if (competition >= 700) demandScore += 6;
  else if (competition >= 400) demandScore += 4;
  else if (competition !== null) demandScore += 2;

  if (fixedPrice && hopeMax && fixedPrice >= hopeMax) demandScore += 6;
  else if (fixedPrice) demandScore += 3;

  if (lockup >= 70) demandScore += 13;
  else if (lockup >= 50) demandScore += 10;
  else if (lockup >= 30) demandScore += 7;
  else if (lockup >= 10) demandScore += 3;
  demandScore = clamp(demandScore, 0, 30);

  let supplyScore = 8;
  if (floatAmount !== null) {
    if (floatAmount <= 400) supplyScore += 7;
    else if (floatAmount <= 700) supplyScore += 5;
    else if (floatAmount <= 1000) supplyScore += 3;
    else supplyScore += 1;
  }
  if (floatRatio !== null) {
    if (floatRatio <= 20) supplyScore += 5;
    else if (floatRatio <= 30) supplyScore += 4;
    else if (floatRatio <= 40) supplyScore += 2;
  }
  if (num(ipo.newShareRatio) >= 90) supplyScore += 4;
  supplyScore = clamp(supplyScore, 0, 25);

  const hot = ['AI', '인공지능', '로봇', '바이오', '반도체', '2차전지', '의료기기', '방산'];
  const text = `${ipo.name || ''} ${ipo.sector || ''} ${ipo.businessSummary || ''}`;
  const businessScore = clamp((hot.some((k) => text.includes(k)) ? 5 : 2) + 10, 0, 20);
  const valuationScore = clamp((fixedPrice ? 4 : 1) + 8, 0, 15);
  const practicalScore = clamp((ipo.underwriter ? 2 : 0) + 6, 0, 10);

  const totalScore = Math.round(demandScore + supplyScore + businessScore + valuationScore + practicalScore);
  const grade = totalScore >= 85 ? 'S' : totalScore >= 75 ? 'A' : totalScore >= 65 ? 'B' : totalScore >= 50 ? 'C' : 'D';
  const warnings = [];
  if (floatAmount > 1000) warnings.push('유통부담');
  if (floatRatio > 40) warnings.push('물량주의');
  if (lockup !== null && lockup < 10) warnings.push('확약약함');
  if (fixedPrice && hopeMax && fixedPrice > hopeMax) warnings.push('상단초과');

  return { demandScore, supplyScore, businessScore, valuationScore, practicalScore, totalScore, grade, warnings };
}
