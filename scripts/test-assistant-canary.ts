/**
 * Unit tests: assistant canary / org allowlist.
 */
import assert from 'node:assert/strict';
import {
  isAssistantOrgAllowed,
  loadAssistantCanaryConfig,
  parseOrgIdList,
} from '../packages/shared/src/assistant-canary';

const ORG_A = '8cd1a37e-000e-4063-8950-ab3972774e06';
const ORG_B = '4421a663-e724-4144-ba80-4d6b3f52c145';
const ORG_C = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function main() {
  assert.deepEqual(parseOrgIdList(`${ORG_A}, ${ORG_B}`), [ORG_A, ORG_B]);
  assert.deepEqual(parseOrgIdList('not-a-uuid,foo'), []);

  // Canary ON — only allowlist
  const canaryEnv = {
    ASSISTANT_ENABLED: 'true',
    ASSISTANT_CANARY: 'true',
    ASSISTANT_CANARY_ORG_IDS: `${ORG_A},${ORG_B}`,
  };
  assert.equal(isAssistantOrgAllowed(ORG_A, canaryEnv), true);
  assert.equal(isAssistantOrgAllowed(ORG_B, canaryEnv), true);
  assert.equal(isAssistantOrgAllowed(ORG_C, canaryEnv), false);
  assert.equal(loadAssistantCanaryConfig(canaryEnv).canaryMode, true);

  // OWNER / any role does not change pure allowlist (caller must not bypass)
  assert.equal(isAssistantOrgAllowed(ORG_C, canaryEnv), false);

  // Canary OFF — all orgs
  const openEnv = {
    ASSISTANT_ENABLED: 'true',
    ASSISTANT_CANARY: 'false',
    ASSISTANT_CANARY_ORG_IDS: ORG_A,
  };
  assert.equal(isAssistantOrgAllowed(ORG_C, openEnv), true);

  // Master off
  assert.equal(
    isAssistantOrgAllowed(ORG_A, {
      ASSISTANT_ENABLED: 'false',
      ASSISTANT_CANARY: 'false',
    }),
    false,
  );

  // Unset canary → open (full prod mode)
  assert.equal(
    isAssistantOrgAllowed(ORG_C, { ASSISTANT_ENABLED: 'true' }),
    true,
  );

  console.log('test-assistant-canary: all passed');
}

main();
