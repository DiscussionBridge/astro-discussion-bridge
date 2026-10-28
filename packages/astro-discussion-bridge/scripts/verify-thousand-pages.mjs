#!/usr/bin/env node
import path from 'node:path';
import { readQualificationInputs, planQualificationRun, materializeQualificationCorpus, admitQualificationCohort, collectQualificationRecords, checkQualificationCoverage } from './qualification-lib.mjs';

const [action, inputFile, ...values] = process.argv.slice(2);
const arity = { plan: 0, materialize: 0, admit: 1, 'collect-records': 0, 'check-coverage': 3 };
if (!Object.hasOwn(arity, action) || !inputFile || !path.isAbsolute(inputFile) || values.length !== arity[action]) throw new Error('Usage: verify-thousand-pages.mjs plan|materialize|admit|collect-records|check-coverage /absolute/inputs.json [count | receiver.json topic-census.json public.json]. No action builds, installs or publishes.');
const { input, artifact } = await readQualificationInputs(inputFile);
let result;
if (action === 'plan') result = { ...(await planQualificationRun(input)), artifact };
else if (action === 'materialize') result = { ...(await materializeQualificationCorpus(input)), artifact };
else if (action === 'admit') result = await admitQualificationCohort(input, Number(values[0]));
else if (action === 'collect-records') result = await collectQualificationRecords(input);
else result = await checkQualificationCoverage(input, ...values);
process.stdout.write(JSON.stringify(result) + '\n');
