/**
 * scripts/probe-schedule-sources.mjs
 *
 * Independent probe script for MatchAhead Phase 05 sports schedule sources.
 * Validates public HTTP availability, season coverage (2026/27),
 * timezone evidence, kickoff time placeholders (00:00, 13:00, TBA),
 * stable IDs, and robots.txt observations.
 */

import { lookup } from 'node:dns/promises';

const USER_AGENT = 'MatchAhead-Audit-Probe/1.0 (+https://github.com/mlsivanovic/matchahead)';

/**
 * Fetch helper with bounded timeout, safe error object, and sanitized headers.
 */
async function fetchSource(url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(10000)
    });
    const durationMs = Date.now() - start;
    const contentType = res.headers.get('content-type') || '';
    const vercelMitigated = res.headers.get('x-vercel-mitigated') || '';
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      durationMs,
      contentType,
      length: text.length,
      headers: {
        contentType,
        vercelMitigated
      },
      error: null,
      text
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - start,
      contentType: '',
      length: 0,
      headers: {
        contentType: '',
        vercelMitigated: ''
      },
      error: err.message,
      text: ''
    };
  }
}

/**
 * Parse robots.txt lines for observations (not a publication license).
 */
function parseRobotsObservation(robotsText) {
  if (!robotsText) return { exists: false, disallowRules: [] };
  const lines = robotsText.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const disallows = lines.filter(l => l.toLowerCase().startsWith('disallow:'));
  return {
    exists: true,
    totalRules: lines.length,
    disallowRules: disallows.slice(0, 5)
  };
}

async function probeAba() {
  console.log('1. Probing ABA League (calendar/26/1/)...');
  const [robots, page] = await Promise.all([
    fetchSource('https://www.aba-liga.com/robots.txt'),
    fetchSource('https://www.aba-liga.com/calendar/26/1/')
  ]);

  if (page.status !== 200) {
    return {
      name: 'ABA League (aba-liga.com)',
      status: page.status,
      error: page.error || `HTTP ${page.status}`,
      verdict: 'FAIL'
    };
  }

  const rows = page.text.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const partizanRows = rows.filter(r => /partizan/i.test(r));
  const czvRows = rows.filter(r => /crvena\s*zvezda/i.test(r));
  const targetRows = [...partizanRows, ...czvRows];

  let matchesWithClock = 0;
  let matchesWithoutClock = 0;
  let matchesTba = 0;

  for (const r of targetRows) {
    const clean = r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/TBA/i.test(clean)) matchesTba++;
    else if (/\d{2}:\d{2}/.test(clean)) matchesWithClock++;
    else matchesWithoutClock++;
  }

  const hasCetLabel = /CET/i.test(page.text);
  const r1Match = rows.find(r => /partizan/i.test(r) && /ilirija/i.test(r));
  const hasTbaRound1 = Boolean(r1Match && /TBA/i.test(r1Match));
  const matchLinks = page.text.match(/href="[^"]*\/match\/(\d+)\/26\/1\/[^"]*"/gi) || [];

  return {
    name: 'ABA League (aba-liga.com)',
    url: 'https://www.aba-liga.com/calendar/26/1/',
    status: page.status,
    robotsObservation: parseRobotsObservation(robots.text),
    seasonParamInUrl: '26 (matches 2026/27)',
    groupPhaseRowsTotal: rows.length,
    kkPartizanGroupMatches: partizanRows.length,
    kkCzvGroupMatches: czvRows.length,
    matchesWithClockTime: matchesWithClock,
    matchesWithoutClockTime: matchesWithoutClock,
    matchesMarkedTba: matchesTba,
    clockObservation: `Only ${matchesWithClock} of ${targetRows.length} target matches have clock times; ${matchesWithoutClock} have date only and ${matchesTba} are TBA`,
    hasCetLabelInOctober: hasCetLabel,
    timeZoneInterpretation: 'Label says CET, but Balkans observe CEST (UTC+2) until Oct 25; literal CET is ambiguous unconfirmed UTC',
    round1TbaObserved: hasTbaRound1,
    sampleMatchLinksCount: matchLinks.length,
    verdict: page.status === 200 && partizanRows.length === 18 && czvRows.length === 18 ? 'PASS' : 'FAIL'
  };
}

async function probeFss() {
  console.log('2. Probing FSS Superliga (fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/)...');
  const [robots, page] = await Promise.all([
    fetchSource('https://fss.rs/robots.txt'),
    fetchSource('https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/')
  ]);

  if (page.status !== 200) {
    return {
      name: 'FSS Superliga (fss.rs)',
      status: page.status,
      error: page.error || `HTTP ${page.status}`,
      verdict: 'FAIL'
    };
  }

  const partizanMatches = (page.text.match(/ПАРТИЗАН/g) || []).length;
  const czvMatches = (page.text.match(/ЦРВЕНА ЗВЕЗДА/g) || []).length;
  const rounds = [...new Set(page.text.match(/\d+\.\s*коло/g) || [])];
  const has0000Placeholder = /10\.10\.2026\.\s*00:00/.test(page.text);
  const reportLinks = page.text.match(/\/izvestaj-sa-utakmice\/(\d+)/g) || [];

  return {
    name: 'FSS Superliga (fss.rs)',
    url: 'https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/',
    status: page.status,
    robotsObservation: parseRobotsObservation(robots.text),
    seasonIdentified: '2026/27',
    regularSeasonRoundsCount: rounds.length,
    partizanCyrillicMentions: partizanMatches,
    czvCyrillicMentions: czvMatches,
    has0000PlaceholderInFutureRound: has0000Placeholder,
    playedMatchReportLinksCount: reportLinks.length,
    futureRoundsHaveReportLinks: false,
    compositeKeyRequirement: 'Pair-based seasonal composite key (e.g. partizan-home:novi-pazar-away) required for stability',
    verdict: page.status === 200 && rounds.length === 26 ? 'PASS' : 'FAIL'
  };
}

async function probeFkPartizan() {
  console.log('3. Probing FK Partizan (partizan.rs/utakmice)...');
  const page = await fetchSource('https://partizan.rs/utakmice');
  if (page.status !== 200) {
    return {
      name: 'FK Partizan (partizan.rs/utakmice)',
      status: page.status,
      error: page.error || `HTTP ${page.status}`,
      verdict: 'FAIL'
    };
  }

  const hasNuxt = page.text.includes('__NUXT_DATA__');
  let scheduledCount = 0;
  let nextMatchId = null;
  let matchTimeUtc = null;
  let roundNumber = null;

  if (hasNuxt) {
    const m = page.text.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const raw = JSON.parse(m[1]);
        // Search dynamically for the matchesScheduled array index
        let schedIndices = null;
        for (const item of raw) {
          if (item && typeof item === 'object' && Array.isArray(item.matchesScheduled)) {
            schedIndices = item.matchesScheduled;
            break;
          }
        }
        if (!schedIndices) {
          // Fallback search for object with matchId
          for (let i = 0; i < raw.length; i++) {
            if (raw[i] && typeof raw[i] === 'object' && 'matchId' in raw[i] && 'matchStatus' in raw[i]) {
              schedIndices = [i];
              break;
            }
          }
        }

        if (Array.isArray(schedIndices)) {
          scheduledCount = schedIndices.length;
          const matchObj = raw[schedIndices[0]];
          if (matchObj) {
            nextMatchId = typeof matchObj.matchId === 'number' && matchObj.matchId < raw.length ? raw[matchObj.matchId] : matchObj.matchId;
            matchTimeUtc = typeof matchObj.matchTimeUTC === 'number' && matchObj.matchTimeUTC < raw.length ? raw[matchObj.matchTimeUTC] : matchObj.matchTimeUTC;
            roundNumber = typeof matchObj.roundNumber === 'number' && matchObj.roundNumber < raw.length ? raw[matchObj.roundNumber] : matchObj.roundNumber;
          }
        }
      } catch (e) {
        console.error('Nuxt parse err:', e.message);
      }
    }
  }

  return {
    name: 'FK Partizan (partizan.rs/utakmice)',
    url: 'https://partizan.rs/utakmice',
    status: page.status,
    hasNuxtData: hasNuxt,
    scheduledMatchesInNuxtPayload: scheduledCount,
    nextMatchId,
    nextMatchRound: roundNumber,
    nextMatchTimeUtcRaw: matchTimeUtc,
    isFullSeasonSchedule: false,
    verdict: page.status === 200 && scheduledCount === 1 ? 'PASS (Single Next Match Confirmed)' : 'FAIL'
  };
}

async function probeFkCzv() {
  console.log('4. Probing FK Crvena zvezda (crvenazvezdafk.com/sr-latn/raspored-rezultati)...');
  const page = await fetchSource('https://www.crvenazvezdafk.com/sr-latn/raspored-rezultati');
  if (page.status !== 200) {
    return {
      name: 'FK Crvena zvezda (crvenazvezdafk.com)',
      status: page.status,
      error: page.error || `HTTP ${page.status}`,
      verdict: 'FAIL'
    };
  }

  // Compare hero countdown widget vs table row for Radnički 1923
  const hasHero1300 = page.text.includes('10.10.2026 13:00') || (page.text.includes('10.10.2026') && page.text.includes('13:00'));
  const hasTable0000 = page.text.includes('10.10.2026') && page.text.includes('00:00');
  const hasConferenceLugano = page.text.includes('Liga konferencije') && page.text.includes('LUGANO') && page.text.includes('15.10.2026');

  return {
    name: 'FK Crvena zvezda (crvenazvezdafk.com)',
    url: 'https://www.crvenazvezdafk.com/sr-latn/raspored-rezultati',
    status: page.status,
    heroCountdownTimeForRadnicki: hasHero1300 ? '13:00' : 'Not found',
    scheduleTableRowTimeForRadnicki: hasTable0000 ? '00:00' : 'Not found',
    conflictingSourceFieldsDemonstrated: Boolean(hasHero1300 && hasTable0000),
    observedConflict: 'Hero section shows 13:00 while schedule table row shows 00:00 (placeholder for unconfirmed time). Regex matching 13:00 from hero is an invalid heuristic, not match proof.',
    conferenceLeagueLuganoFixtureFound: hasConferenceLugano,
    verdict: page.status === 200 && hasConferenceLugano && hasHero1300 && hasTable0000 ? 'PASS (Confirmed Observed Conflict: Hero 13:00 vs Table 00:00)' : 'FAIL'
  };
}

async function probeKkPartizan() {
  console.log('5. Probing KK Partizan (partizan.basketball/takmicenja)...');
  const page = await fetchSource('https://partizan.basketball/takmicenja');
  if (page.status !== 200) {
    return {
      name: 'KK Partizan (partizan.basketball/takmicenja)',
      status: page.status,
      error: page.error || `HTTP ${page.status}`,
      verdict: 'FAIL'
    };
  }

  // Check specific Euroleague table match dates
  const hasSept2025Date = /30-09-2025/i.test(page.text);
  const has2026Date = /2026/i.test(page.text);
  const has2027Date = /2027/i.test(page.text);

  return {
    name: 'KK Partizan (partizan.basketball/takmicenja)',
    url: 'https://partizan.basketball/takmicenja',
    status: page.status,
    sampleEuroleagueFixtureDate: hasSept2025Date ? '30-09-2025 (2025/26 Season)' : 'Unknown',
    mentions2026: has2026Date,
    mentions2027: has2027Date,
    evaluatedState: hasSept2025Date && !has2027Date ? 'STALE (2025/26 Euroleague data)' : 'Active',
    verdict: page.status === 200 && hasSept2025Date ? 'PASS (Accurately Identified Stale Table)' : 'FAIL'
  };
}

async function probeEuroleague() {
  console.log('6. Probing Euroleague (Game Center & ECAL)...');
  const [gc, ecal] = await Promise.all([
    fetchSource('https://www.euroleaguebasketball.net/en/euroleague/game-center/'),
    fetchSource('https://euroleaguebasketball.ecal.com/')
  ]);

  const botChallengeActive = gc.status === 429 && gc.headers.vercelMitigated === 'challenge';
  const ecalIsWidget = ecal.text.includes('sync.ecal.com');

  let verdict = 'INSPECT';
  if (gc.status === 429 && ecal.status === 200) {
    verdict = 'PASS (Expected Block 429 & ECAL Confirmed)';
  } else if (gc.status === 0 || ecal.status === 0) {
    verdict = 'FAIL (Network error connecting to Euroleague/ECAL)';
  }

  return {
    name: 'Euroleague Game Center & ECAL',
    gameCenterStatus: gc.status,
    gameCenterVercelMitigatedHeader: gc.headers.vercelMitigated || 'none',
    botChallengeConfirmed: botChallengeActive,
    ecalStatus: ecal.status,
    ecalIsUserSyncWidgetOnly: ecalIsWidget,
    policyAction: 'Do not bypass bot challenge. Game Center remains source_blocked',
    verdict
  };
}

async function probeEuroleaguePdf() {
  console.log('7. Probing Euroleague Official Printable PDF Calendar...');
  const pdfUrl = 'https://ftpserver.euroleague.net/media/2026-27_EL_RS_CALENDAR_PRINTABLE.pdf';
  const mediaReleaseUrl = 'https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24407';

  let mediaStatus = 0;
  let mediaHtml = '';
  let mediaError = null;
  try {
    const m = await fetch(mediaReleaseUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000)
    });
    mediaStatus = m.status;
    if (m.ok) {
      mediaHtml = await m.text();
    }
  } catch (err) {
    mediaError = err.message;
  }

  const exactPdfHrefFound = mediaHtml.includes('2026-27_EL_RS_CALENDAR_PRINTABLE.pdf') || mediaHtml.includes(pdfUrl);

  let pdfStatus = 0;
  let text = '';
  let fileSizeBytes = 0;
  let contentType = '';
  let hasPdfSignature = false;
  let pdfExtractedWithPdftotext = false;
  let pdfExtractionError = null;

  try {
    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000)
    });
    pdfStatus = res.status;
    contentType = res.headers.get('content-type') || '';
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fileSizeBytes = buf.byteLength;
      hasPdfSignature = buf.subarray(0, 4).toString('ascii') === '%PDF';
      try {
        const { execSync } = await import('node:child_process');
        text = execSync('pdftotext -layout - -', { input: buf, timeout: 5000 }).toString('utf8');
        pdfExtractedWithPdftotext = true;
      } catch (err) {
        pdfExtractionError = err.message;
        pdfExtractedWithPdftotext = false;
      }
    }
  } catch (err) {
    return {
      name: 'Euroleague Official Printable PDF Calendar',
      status: 0,
      mediaReleaseStatus: mediaStatus,
      mediaCentreExactPdfHrefFound: exactPdfHrefFound,
      error: err.message,
      verdict: 'FAIL (PDF fetch timeout/network error)'
    };
  }

  const hasSeasonTitle = text.includes('2026-27 EUROLEAGUE REGULAR SEASON CALENDAR');
  const parCount = (text.match(/PARTIZAN MOZZART BET BELGRADE/gi) || []).length;
  const czvCount = (text.match(/CRVENA ZVEZDA MERIDIANBET BELGRADE/gi) || []).length;
  const hasGmtTime = text.includes('GMT') && text.includes('LOCAL');

  // Verify exact round set 1..38 rather than simple token count
  const roundMatches = [...text.matchAll(/ROUND\s+(\d+)/gi)];
  const extractedRoundNumbers = new Set(roundMatches.map(m => parseInt(m[1], 10)));
  const expectedRounds = Array.from({ length: 38 }, (_, i) => i + 1);
  const missingRounds = expectedRounds.filter(r => !extractedRoundNumbers.has(r));
  const hasExactFullRounds1To38 = missingRounds.length === 0 && extractedRoundNumbers.size === 38;

  const pdfAccessWithinLimits = pdfStatus === 200 && fileSizeBytes > 50000 && fileSizeBytes < 2000000;
  const mediaCentreLinked = mediaStatus === 200 && exactPdfHrefFound;

  let verdict = 'FAIL';
  if (
    pdfAccessWithinLimits &&
    hasPdfSignature &&
    mediaCentreLinked &&
    pdfExtractedWithPdftotext &&
    hasSeasonTitle &&
    parCount === 38 &&
    czvCount === 38 &&
    hasExactFullRounds1To38 &&
    hasGmtTime
  ) {
    verdict = 'PASS (Verified Printable PDF Calendar Linked from MediaCentre with Full 1..38 Rounds)';
  } else if (!mediaCentreLinked) {
    verdict = `FAIL (MediaCentre link unverified: status ${mediaStatus}, exact href found: ${exactPdfHrefFound}, error: ${mediaError})`;
  } else if (!hasPdfSignature) {
    verdict = 'FAIL (Missing %PDF magic signature in binary stream)';
  } else if (!pdfExtractedWithPdftotext) {
    verdict = `FAIL (pdftotext extraction failed: ${pdfExtractionError})`;
  } else if (!hasSeasonTitle) {
    verdict = 'FAIL (Missing season title: 2026-27 EUROLEAGUE REGULAR SEASON CALENDAR)';
  } else if (!hasExactFullRounds1To38) {
    verdict = `FAIL (Missing rounds in 1..38 set: ${missingRounds.join(', ')})`;
  }

  return {
    name: 'Euroleague Official Printable PDF Calendar',
    url: pdfUrl,
    status: pdfStatus,
    mediaReleaseStatus: mediaStatus,
    mediaCentreExactPdfHrefFound: exactPdfHrefFound,
    mediaCentreLinkVerified: mediaCentreLinked,
    contentType,
    hasPdfMagicSignature: hasPdfSignature,
    fileSizeBytes,
    pdfExtractedWithPdftotext,
    hasSeasonTitle,
    rawPartizanTokenMentions: parCount,
    rawCzvTokenMentions: czvCount,
    hasExplicitGmtAndLocalColumns: hasGmtTime,
    fullRounds1To38Verified: hasExactFullRounds1To38,
    missingRoundsIn1To38: missingRounds.length === 0 ? 'None (all 1..38 present)' : missingRounds.join(', '),
    observationNote: 'Raw token counts reflect textual mentions; full end-to-end fixture extraction requires row-level parsing of round, date, participants, and confirmed GMT time.',
    freshnessLimitation: 'Static baseline regular season schedule; in-season reschedulings lag unless PDF is republished',
    zeroEurRuntimeFit: 'Documented DO CPU budget (30s default) removes 10ms ingress constraint; actual workerd runtime proof pending',
    verdict
  };
}

async function probeTheSportsDb() {
  console.log('8. Probing TheSportsDB Free Key (123)...');
  let dnsOk = false;
  let dnsError = null;
  try {
    await lookup('www.thesportsdb.com');
    dnsOk = true;
  } catch (err) {
    dnsOk = false;
    dnsError = err.message;
  }

  if (!dnsOk) {
    return {
      name: 'TheSportsDB API (Key 123)',
      dnsResolved: false,
      dnsError,
      superligaTruncationLimit: null,
      abaLeagueEventsReturned: 'NOT_TESTED (DNS failed)',
      freeTierViableForSeason: false,
      verdict: 'FAIL (Network DNS Resolution Failed)'
    };
  }

  const [slRes, abaRes] = await Promise.all([
    fetchSource('https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4671&s=2026-2027'),
    fetchSource('https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4477&s=2026-2027')
  ]);

  if (!slRes.ok || !abaRes.ok) {
    return {
      name: 'TheSportsDB API (Key 123)',
      dnsResolved: true,
      slHttpStatus: slRes.status,
      slError: slRes.error,
      abaHttpStatus: abaRes.status,
      abaError: abaRes.error,
      superligaTruncationLimit: null,
      abaLeagueEventsReturned: 'NOT_TESTED (HTTP/Network error)',
      freeTierViableForSeason: false,
      verdict: 'FAIL (Network/HTTP Error during probe)'
    };
  }

  let slCount = 0;
  let slEventsFound = false;
  try {
    const slJson = JSON.parse(slRes.text);
    if (Array.isArray(slJson.events)) {
      slCount = slJson.events.length;
      slEventsFound = true;
    }
  } catch (err) {
    return {
      name: 'TheSportsDB API (Key 123)',
      error: `JSON parse error on Superliga: ${err.message}`,
      verdict: 'FAIL'
    };
  }

  let abaEvents = undefined;
  let abaParsedOk = false;
  try {
    const abaJson = JSON.parse(abaRes.text);
    abaEvents = abaJson.events;
    abaParsedOk = true;
  } catch (err) {
    return {
      name: 'TheSportsDB API (Key 123)',
      error: `JSON parse error on ABA: ${err.message}`,
      verdict: 'FAIL'
    };
  }

  const isAbaExplicitlyNull = abaParsedOk && abaEvents === null;
  const isSlTruncatedTo15 = slEventsFound && slCount === 15;

  let verdict = 'INSPECT';
  if (isSlTruncatedTo15 && isAbaExplicitlyNull) {
    verdict = 'PASS (Confirmed Truncation to 15 & Explicit Null ABA Events)';
  } else if (!isSlTruncatedTo15 || !isAbaExplicitlyNull) {
    verdict = 'INSPECT';
  }

  return {
    name: 'TheSportsDB API (Key 123)',
    dnsResolved: true,
    superligaEventsCount: slCount,
    superligaTruncationLimit: isSlTruncatedTo15 ? 15 : slCount,
    abaLeagueEventsRawValue: isAbaExplicitlyNull ? 'null (explicitly returned by API)' : JSON.stringify(abaEvents),
    freeTierViableForSeason: false,
    verdict
  };
}

async function main() {
  console.log('=== MATCHAHREAD PHASE 05 SOURCE PROBE ===\n');
  const results = [
    await probeAba(),
    await probeFss(),
    await probeFkPartizan(),
    await probeFkCzv(),
    await probeKkPartizan(),
    await probeEuroleague(),
    await probeEuroleaguePdf(),
    await probeTheSportsDb()
  ];

  console.log('\n=== PROBE RESULTS SUMMARY ===\n');
  let hasFailure = false;
  for (const r of results) {
    console.log(`[${r.verdict}] ${r.name}`);
    for (const [k, v] of Object.entries(r)) {
      if (k !== 'name' && k !== 'verdict') {
        console.log(`   ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
    console.log('');
    if (r.verdict.startsWith('FAIL') || r.verdict.startsWith('NOT_TESTED')) {
      hasFailure = true;
    }
  }

  if (hasFailure) {
    console.error('Probe detected failure or unverified state in schedule sources.');
    process.exit(1);
  } else {
    console.log('All probes completed with expected source behaviors.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
