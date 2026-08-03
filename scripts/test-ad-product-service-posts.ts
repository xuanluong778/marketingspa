/**
 * Tests: product/service generate (template), exclusivity, draft migrate.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-ad-product-service-posts.ts
 */
import assert from 'assert';
import {
  assertExclusiveProductService,
  generateProductOrServiceAdContent,
} from '../apps/api/src/content-marketing/ad-product-service.logic';

function assertExclusivePayload(payload: Record<string, unknown>) {
  const hasProduct = Boolean(payload.product);
  const hasService = Boolean(payload.service);
  assert.ok(!(hasProduct && hasService), 'payload must not include both product and service');
  if (payload.adPostKind === 'product') assert.ok(hasProduct && !hasService);
  if (payload.adPostKind === 'service') assert.ok(hasService && !hasProduct);
}

/** Mirrors apps/web buildAdGeneratePayload exclusivity contract */
function buildAdGeneratePayloadMirror(form: {
  adPostKind: 'product' | 'service';
  brandName: string;
  productService: string;
  productDetails: Record<string, string>;
  serviceDetails: Record<string, string>;
  platform: string;
  tone: string;
  adContentType: string;
}) {
  const kind = form.adPostKind === 'service' ? 'service' : 'product';
  const base = {
    mode: 'ad' as const,
    adPostKind: kind,
    brandName: form.brandName || undefined,
    productService:
      kind === 'product'
        ? form.productDetails.name || form.productService
        : form.serviceDetails.name || form.productService,
    platform: form.platform,
    tone: form.tone,
    adContentType: form.adContentType,
  };
  if (kind === 'product') {
    return { ...base, product: { ...form.productDetails, name: base.productService } };
  }
  return { ...base, service: { ...form.serviceDetails, name: base.productService } };
}

function migrateLegacyDraft(raw: { version: number; form: Record<string, unknown>; content: string }) {
  const form = {
    ...raw.form,
    adPostKind:
      raw.form.adPostKind === 'service' || raw.form.adPostKind === 'product'
        ? raw.form.adPostKind
        : 'product',
    brandName: (raw.form.brandName as string) ?? '',
    productDetails: {
      name: '',
      category: '',
      features: '',
      benefits: '',
      differentiators: '',
      price: '',
      warranty: '',
      proof: '',
      offer: '',
      ...((raw.form.productDetails as object) ?? {}),
    },
    serviceDetails: {
      name: '',
      suitableCustomers: '',
      problems: '',
      process: '',
      highlights: '',
      expectedBenefits: '',
      duration: '',
      location: '',
      experts: '',
      proof: '',
      offer: '',
      ...((raw.form.serviceDetails as object) ?? {}),
    },
  } as {
    adPostKind: 'product' | 'service';
    brandName: string;
    productService: string;
    productDetails: { name: string };
  };
  if (!form.productDetails.name.trim() && String(form.productService || '').trim()) {
    form.productDetails = { ...form.productDetails, name: String(form.productService) };
  }
  return {
    version: 3,
    schemaVersion: 3,
    form,
    content: raw.content,
  };
}

async function main() {
  assert.throws(
    () =>
      assertExclusiveProductService({
        mode: 'ad',
        productService: 'X',
        product: { name: 'A' },
        service: { name: 'B' },
      } as never),
    /INVALID_AD_PAYLOAD/,
    'backend rejects both product+service',
  );

  assert.doesNotThrow(() =>
    assertExclusiveProductService({
      mode: 'ad',
      productService: 'Serum',
      adPostKind: 'product',
      product: { name: 'Serum' },
    } as never),
  );

  const productOut = await generateProductOrServiceAdContent(
    {
      mode: 'ad',
      productService: 'Serum nám XYZ',
      adPostKind: 'product',
      brandName: 'Spa Hoa Sen',
      product: {
        name: 'Serum nám XYZ',
        category: 'Chăm sóc da',
        features: 'Niacinamide 10%',
        benefits: 'Da đều màu',
        differentiators: 'Công thức lâm sàng',
        price: '890.000đ',
        warranty: 'Đổi 7 ngày',
        proof: '200+ review',
        offer: 'Giảm 20%',
      },
      platform: 'facebook',
      tone: 'friendly',
      cta: 'Inbox "SERUM"',
    } as never,
  );

  assert.ok(productOut.content?.length > 10, 'product content');
  assert.ok(productOut.hooks?.length > 0, 'product hooks');
  assert.ok(productOut.ctas?.length > 0, 'product ctas');
  assert.ok(productOut.headline, 'product headline');
  assert.ok(productOut.shortDescription != null, 'product shortDescription');
  assert.ok((productOut.mediaSuggestions?.length ?? 0) > 0);
  assert.strictEqual(productOut.adPostKind, 'product');
  assert.strictEqual(productOut.source, 'template');

  const serviceOut = await generateProductOrServiceAdContent(
    {
      mode: 'ad',
      productService: 'Liệu trình trẻ hóa',
      adPostKind: 'service',
      brandName: 'Spa Hoa Sen',
      service: {
        name: 'Liệu trình trẻ hóa',
        suitableCustomers: 'Nữ 30+',
        problems: 'Da lão hóa',
        process: 'Tư vấn → trị liệu → chăm sóc',
        highlights: 'RF + serum',
        expectedBenefits: 'Da săn hơn',
        duration: '90 phút',
        location: 'Q1',
        experts: 'KT viên chuyên sâu',
        proof: '500 khách',
        offer: 'Giảm 30%',
      },
      platform: 'facebook',
      tone: 'empathetic',
      cta: 'Inbox "TƯ VẤN"',
    } as never,
  );

  assert.ok(serviceOut.content?.length > 10, 'service content');
  assert.ok(serviceOut.headline, 'service headline');
  assert.strictEqual(serviceOut.adPostKind, 'service');
  assert.ok(/dịch vụ|liệu trình/i.test(serviceOut.content));

  const legacyOut = await generateProductOrServiceAdContent({
    mode: 'ad',
    productService: 'Serum legacy',
    benefits: 'Sáng da',
    offer: 'Giảm 10%',
    platform: 'facebook',
  } as never);
  assert.strictEqual(legacyOut.adPostKind, 'product');
  assert.ok(legacyOut.content.includes('Serum legacy'));

  const productPayload = buildAdGeneratePayloadMirror({
    adPostKind: 'product',
    brandName: 'Spa Demo',
    productService: 'Serum',
    productDetails: {
      name: 'Serum',
      category: 'Da',
      features: 'f',
      benefits: 'b',
      differentiators: 'd',
      price: '100k',
      warranty: '7d',
      proof: 'p',
      offer: '10%',
    },
    serviceDetails: {
      name: '',
      suitableCustomers: '',
      problems: '',
      process: '',
      highlights: '',
      expectedBenefits: '',
      duration: '',
      location: '',
      experts: '',
      proof: '',
      offer: '',
    },
    platform: 'facebook',
    tone: 'friendly',
    adContentType: 'sales',
  });
  assertExclusivePayload(productPayload as never);

  const servicePayload = buildAdGeneratePayloadMirror({
    adPostKind: 'service',
    brandName: 'Spa Demo',
    productService: 'Massage',
    productDetails: {
      name: 'SHOULD_NOT_SEND',
      category: '',
      features: '',
      benefits: '',
      differentiators: '',
      price: '',
      warranty: '',
      proof: '',
      offer: '',
    },
    serviceDetails: {
      name: 'Massage đá nóng',
      suitableCustomers: 'Văn phòng',
      problems: 'Đau cổ',
      process: 'Chườm',
      highlights: 'Đá',
      expectedBenefits: 'Giảm đau',
      duration: '60p',
      location: 'Q3',
      experts: 'KT',
      proof: '300',
      offer: '15%',
    },
    platform: 'facebook',
    tone: 'friendly',
    adContentType: 'sales',
  });
  // Mirror builder always picks one side by kind — even if other side has leftover name
  assertExclusivePayload(servicePayload as never);
  assert.strictEqual((servicePayload as { service?: { name: string } }).service?.name, 'Massage đá nóng');

  const restored = migrateLegacyDraft({
    version: 2,
    form: {
      productService: 'Legacy serum',
      targetAudience: 'Nữ 25-40',
      platform: 'facebook',
      tone: 'friendly',
      adContentType: 'sales',
      personalPostType: 'personal_story',
      cta: 'Inbox',
      videoUrl: '',
      transcript: '',
      adObjective: 'messages',
    },
    content: 'Bài cũ còn đó',
  });
  assert.strictEqual(restored.content, 'Bài cũ còn đó');
  assert.strictEqual(restored.form.adPostKind, 'product');
  assert.strictEqual(restored.schemaVersion, 3);
  assert.strictEqual(restored.form.productDetails.name, 'Legacy serum');

  console.log('✅ ad product/service posts tests PASSED');
  console.log(
    JSON.stringify(
      {
        beforePayload: {
          mode: 'ad',
          productService: 'Serum nám XYZ',
          targetAudience: '...',
          painPoints: '...',
          benefits: '...',
          offer: '...',
          platform: 'facebook',
          tone: 'friendly',
          cta: '...',
          adContentType: 'sales',
        },
        afterProductPayload: productPayload,
        afterServicePayload: {
          mode: servicePayload.mode,
          adPostKind: servicePayload.adPostKind,
          brandName: servicePayload.brandName,
          productService: servicePayload.productService,
          service: (servicePayload as { service: unknown }).service,
        },
        productExtras: {
          headline: productOut.headline,
          shortDescription: productOut.shortDescription,
          mediaSuggestions: productOut.mediaSuggestions,
        },
        serviceExtras: {
          headline: serviceOut.headline,
          shortDescription: serviceOut.shortDescription,
          mediaSuggestions: serviceOut.mediaSuggestions,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
