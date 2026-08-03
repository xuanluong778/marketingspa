import type { ContentFormState } from '@/types/content-marketing';
import type { AdUrlAnalyzeSuggestion } from '@/hooks/use-ad-url-analyze';
import { emptyAdProductDetails, emptyAdServiceDetails } from '@/types/content-marketing';

export type AdUrlPreviewField = {
  key: string;
  label: string;
  value: string;
  /** path used for apply */
  path: string;
};

const PRODUCT_LABELS: Record<string, string> = {
  name: 'Tên sản phẩm',
  category: 'Danh mục',
  features: 'Tính năng',
  benefits: 'Lợi ích',
  differentiators: 'Điểm khác biệt',
  price: 'Giá',
  warranty: 'Bảo hành',
  proof: 'Bằng chứng',
  offer: 'Ưu đãi',
};

const SERVICE_LABELS: Record<string, string> = {
  name: 'Tên dịch vụ',
  suitableCustomers: 'Khách hàng phù hợp',
  problems: 'Vấn đề',
  process: 'Quy trình',
  highlights: 'Điểm nổi bật',
  expectedBenefits: 'Lợi ích kỳ vọng',
  duration: 'Thời gian',
  location: 'Địa điểm',
  experts: 'Chuyên gia',
  proof: 'Bằng chứng',
  offer: 'Ưu đãi',
};

export function buildAdUrlPreviewFields(
  suggestion: AdUrlAnalyzeSuggestion,
): AdUrlPreviewField[] {
  const fields: AdUrlPreviewField[] = [];
  if (suggestion.brandName?.trim()) {
    fields.push({
      key: 'brandName',
      label: 'Tên thương hiệu / cơ sở',
      value: suggestion.brandName.trim(),
      path: 'brandName',
    });
  }
  if (suggestion.targetAudience?.trim()) {
    fields.push({
      key: 'targetAudience',
      label: 'Khách hàng mục tiêu',
      value: suggestion.targetAudience.trim(),
      path: 'targetAudience',
    });
  }
  if (suggestion.painPoints?.trim()) {
    fields.push({
      key: 'painPoints',
      label: 'Nỗi đau',
      value: suggestion.painPoints.trim(),
      path: 'painPoints',
    });
  }
  if (suggestion.benefits?.trim()) {
    fields.push({
      key: 'benefits',
      label: 'Lợi ích (chung)',
      value: suggestion.benefits.trim(),
      path: 'benefits',
    });
  }
  if (suggestion.offer?.trim()) {
    fields.push({
      key: 'offer',
      label: 'Ưu đãi (chung)',
      value: suggestion.offer.trim(),
      path: 'offer',
    });
  }

  if (suggestion.adPostKind === 'product' && suggestion.product) {
    for (const [k, label] of Object.entries(PRODUCT_LABELS)) {
      const v = suggestion.product[k]?.trim();
      if (v) {
        fields.push({
          key: `product.${k}`,
          label,
          value: v,
          path: `product.${k}`,
        });
      }
    }
  }
  if (suggestion.adPostKind === 'service' && suggestion.service) {
    for (const [k, label] of Object.entries(SERVICE_LABELS)) {
      const v = suggestion.service[k]?.trim();
      if (v) {
        fields.push({
          key: `service.${k}`,
          label,
          value: v,
          path: `service.${k}`,
        });
      }
    }
  }
  return fields;
}

function getFormValueAtPath(form: ContentFormState, path: string): string {
  if (path === 'brandName') return form.brandName || '';
  if (path === 'targetAudience') return form.targetAudience || '';
  if (path === 'painPoints') return form.painPoints || '';
  if (path === 'benefits') return form.benefits || '';
  if (path === 'offer') return form.offer || '';
  if (path.startsWith('product.')) {
    const k = path.slice('product.'.length) as keyof typeof form.productDetails;
    return String(form.productDetails?.[k] ?? '');
  }
  if (path.startsWith('service.')) {
    const k = path.slice('service.'.length) as keyof typeof form.serviceDetails;
    return String(form.serviceDetails?.[k] ?? '');
  }
  return '';
}

export function findOverwriteConflicts(
  form: ContentFormState,
  selected: AdUrlPreviewField[],
): AdUrlPreviewField[] {
  return selected.filter((f) => getFormValueAtPath(form, f.path).trim().length > 0);
}

/** Apply selected suggestion fields. Only overwrites when `allowOverwrite` is true. */
export function applyAdUrlSuggestionToForm(
  form: ContentFormState,
  selected: AdUrlPreviewField[],
  options: { allowOverwrite: boolean },
): ContentFormState {
  const next: ContentFormState = {
    ...form,
    productDetails: { ...emptyAdProductDetails(), ...form.productDetails },
    serviceDetails: { ...emptyAdServiceDetails(), ...form.serviceDetails },
  };

  for (const field of selected) {
    const current = getFormValueAtPath(next, field.path).trim();
    if (current && !options.allowOverwrite) continue;

    if (field.path === 'brandName') next.brandName = field.value;
    else if (field.path === 'targetAudience') next.targetAudience = field.value;
    else if (field.path === 'painPoints') next.painPoints = field.value;
    else if (field.path === 'benefits') {
      next.benefits = field.value;
      if (next.adPostKind === 'product') {
        next.productDetails = { ...next.productDetails, benefits: field.value };
      }
    } else if (field.path === 'offer') {
      next.offer = field.value;
      if (next.adPostKind === 'product') {
        next.productDetails = { ...next.productDetails, offer: field.value };
      } else {
        next.serviceDetails = { ...next.serviceDetails, offer: field.value };
      }
    } else if (field.path.startsWith('product.')) {
      const k = field.path.slice('product.'.length);
      next.productDetails = { ...next.productDetails, [k]: field.value };
      if (k === 'name') next.productService = field.value;
      if (k === 'benefits') next.benefits = field.value;
      if (k === 'offer') next.offer = field.value;
    } else if (field.path.startsWith('service.')) {
      const k = field.path.slice('service.'.length);
      next.serviceDetails = { ...next.serviceDetails, [k]: field.value };
      if (k === 'name') next.productService = field.value;
      if (k === 'suitableCustomers') next.targetAudience = field.value;
      if (k === 'problems') next.painPoints = field.value;
      if (k === 'expectedBenefits') next.benefits = field.value;
      if (k === 'offer') next.offer = field.value;
    }
  }

  // Mutual exclusivity
  if (next.adPostKind === 'product') {
    next.serviceDetails = emptyAdServiceDetails();
  } else {
    next.productDetails = emptyAdProductDetails();
  }
  return next;
}
