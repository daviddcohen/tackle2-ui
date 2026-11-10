import { type RestHandler } from "msw";

import { config } from "../config";

import agentic from "./agentic/handlers";
import applications from "./applications";
import archetypes from "./archetypes";
import assessments from "./assessments";
import platforms from "./platforms";
import prototypeSupport from "./prototype-support";
import questionnaires from "./questionnaires";
import stakeholders from "./stakeholders";

const enableMe = (me: string) =>
  config.stub === "*" ||
  (Array.isArray(config.stub) ? (config.stub as string[]).includes(me) : false);

/**
 * Return the stub-new-work handlers that are enabled by config.
 */
const enabledStubs: RestHandler[] = [
  ...(enableMe("applications") ? applications : []),
  ...(enableMe("archetypes") ? archetypes : []),
  ...(enableMe("assessments") ? assessments : []),
  ...(enableMe("questionnaires") ? questionnaires : []),
  ...(enableMe("stakeholders") ? stakeholders : []),
  ...(enableMe("platforms") ? platforms : []),
  // Non-agentic hub endpoints the prototype demo needs (identities, tags,
  // tasks, settings, ...). A separate group so `MOCK=stub=agentic.pass`
  // against a real hub fakes only the agentic API.
  ...(enableMe("prototype-support") ? prototypeSupport : []),
  ...(enableMe("agentic") ? agentic : []),
].filter(Boolean);

export default enabledStubs;
