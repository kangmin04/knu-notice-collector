import { parseGnuboard } from "./gnuboard.js";
import { parseKnuHome } from "./knuHome.js";
import { parseKnuWbbs } from "./knuWbbs.js";
import { parseDgtp } from "./egov.js";
import { parseDip } from "./dip.js";
import { parseCcei } from "./ccei.js";
import { parseIncruit } from "./incruit.js";
import { parseContestKorea } from "./contestkorea.js";
import { parseSaramin } from "./saramin.js";
import { parseJobkorea } from "./jobkorea.js";
import { parseAllcon } from "./allcon.js";
import { parseThinkContest } from "./thinkcontest.js";
import { parseLinkareer } from "./linkareer.js";
import { parseOkky } from "./okky.js";
import { parseWevity } from "./wevity.js";
import { parseEventus } from "./eventus.js";
import { parseDacon } from "./dacon.js";

export const parsers = {
  gnuboard: parseGnuboard,
  knuHome: parseKnuHome,
  knuWbbs: parseKnuWbbs,
  dgtp: parseDgtp,
  dip: parseDip,
  ccei: parseCcei,
  incruit: parseIncruit,
  contestkorea: parseContestKorea,
  saramin: parseSaramin,
  jobkorea: parseJobkorea,
  allcon: parseAllcon,
  thinkcontest: parseThinkContest,
  linkareer: parseLinkareer,
  okky: parseOkky,
  wevity: parseWevity,
  eventus: parseEventus,
  dacon: parseDacon,
};
