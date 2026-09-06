/**
 * Funnel design toggle gates (Phễu Marketing → Phễu của tôi).
 * Run: node scripts/test-funnel-design-toggle.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const verdict = {
  EDIT_DIRECT_UNCHANGED: 'FAIL',
  DESIGN_FUNNEL_OPEN: 'FAIL',
  DESIGN_FUNNEL_HIDE: 'FAIL',
  STATE_PRESERVED: 'FAIL',
  FUNNEL_DESIGN_TOGGLE_E2E: 'FAIL',
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function main() {
  console.log('=== funnel design toggle gates ===');

  const mineCard = read('apps/web/src/components/funnel/funnel-mine-card.tsx');
  const minePanel = read('apps/web/src/components/funnel/funnel-mine-panel.tsx');
  const canvas = read('apps/web/src/components/funnel/funnel-canvas-panel.tsx');
  const funnelPage = read('apps/web/src/app/(app)/funnel/page.tsx');
  const directEdit = read('apps/web/src/components/funnel/funnel-direct-edit-button.tsx');

  if (
    mineCard.includes('FunnelDirectEditButton') &&
    mineCard.includes('funnelPreviewHref') === false &&
    directEdit.includes('Sửa trực tiếp') &&
    directEdit.includes('funnelPreviewHref') &&
    !mineCard.includes('router.replace(funnelHref({ tab: \'mine\', draft: row.id }))')
  ) {
    verdict.EDIT_DIRECT_UNCHANGED = 'PASS';
    console.log('PASS EDIT_DIRECT_UNCHANGED');
  } else {
    console.log('FAIL EDIT_DIRECT_UNCHANGED');
  }

  if (
    mineCard.includes('Thiết kế phễu') &&
    mineCard.includes('FunnelCanvasPanel') &&
    mineCard.includes('embedded') &&
    mineCard.includes('onToggleDesign') &&
    minePanel.includes('visibleDesignId') &&
    !funnelPage.includes('FunnelCanvasPanel')
  ) {
    verdict.DESIGN_FUNNEL_OPEN = 'PASS';
    console.log('PASS DESIGN_FUNNEL_OPEN');
  } else {
    console.log('FAIL DESIGN_FUNNEL_OPEN');
  }

  if (mineCard.includes('Ẩn phễu') && mineCard.includes('designVisible ?')) {
    verdict.DESIGN_FUNNEL_HIDE = 'PASS';
    console.log('PASS DESIGN_FUNNEL_HIDE');
  } else {
    console.log('FAIL DESIGN_FUNNEL_HIDE');
  }

  if (
    minePanel.includes('mountedDesignIds') &&
    mineCard.includes('designMounted') &&
    canvas.includes('visible') &&
    canvas.includes('!visible && \'hidden\'')
  ) {
    verdict.STATE_PRESERVED = 'PASS';
    console.log('PASS STATE_PRESERVED');
  } else {
    console.log('FAIL STATE_PRESERVED');
  }

  const gates = ['EDIT_DIRECT_UNCHANGED', 'DESIGN_FUNNEL_OPEN', 'DESIGN_FUNNEL_HIDE', 'STATE_PRESERVED'];
  verdict.FUNNEL_DESIGN_TOGGLE_E2E = gates.every((g) => verdict[g] === 'PASS') ? 'PASS' : 'FAIL';

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);
  if (verdict.FUNNEL_DESIGN_TOGGLE_E2E !== 'PASS') process.exitCode = 1;
}

main();
