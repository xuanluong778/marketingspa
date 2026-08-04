"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacebookPolicyAnalyzeMediaDto = exports.FacebookPolicyImportUrlDto = exports.FacebookPolicyRewriteDto = exports.FacebookPolicyCheckDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const SPECIAL_AD_CATEGORIES = [
    'NONE',
    'CREDIT',
    'EMPLOYMENT',
    'HOUSING',
    'SOCIAL_ISSUES_ELECTIONS_POLITICS',
];
const URL_KINDS = [
    'website',
    'facebook_post',
    'facebook_video',
    'facebook_reel',
    'landing_page',
    'unknown',
];
class FacebookPolicyCheckDto {
    headline;
    primaryText;
    description;
    cta;
    productService;
    audience;
    country;
    ageMin;
    ageMax;
    specialAdCategory;
    brandName;
    contentToRewrite;
    imageOcrText;
    transcript;
    landingPageText;
    landingUrl;
    /** Ignored — organizationId comes from JWT/TenantGuard only. */
    organizationId;
}
exports.FacebookPolicyCheckDto = FacebookPolicyCheckDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "headline", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20000),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "primaryText", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "cta", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "productService", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "audience", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(10),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(13),
    (0, class_validator_1.Max)(65),
    __metadata("design:type", Number)
], FacebookPolicyCheckDto.prototype, "ageMin", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(13),
    (0, class_validator_1.Max)(65),
    __metadata("design:type", Number)
], FacebookPolicyCheckDto.prototype, "ageMax", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([...SPECIAL_AD_CATEGORIES]),
    __metadata("design:type", Object)
], FacebookPolicyCheckDto.prototype, "specialAdCategory", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "brandName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20000),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "contentToRewrite", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20000),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "imageOcrText", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50000),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "transcript", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30000),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "landingPageText", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "landingUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FacebookPolicyCheckDto.prototype, "organizationId", void 0);
class FacebookPolicyRewriteDto extends FacebookPolicyCheckDto {
}
exports.FacebookPolicyRewriteDto = FacebookPolicyRewriteDto;
class FacebookPolicyImportUrlDto {
    url;
    urlKind;
    fanpageId;
}
exports.FacebookPolicyImportUrlDto = FacebookPolicyImportUrlDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], FacebookPolicyImportUrlDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([...URL_KINDS]),
    __metadata("design:type", Object)
], FacebookPolicyImportUrlDto.prototype, "urlKind", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], FacebookPolicyImportUrlDto.prototype, "fanpageId", void 0);
class FacebookPolicyAnalyzeMediaDto {
    caption;
    mediaType;
    transcript;
}
exports.FacebookPolicyAnalyzeMediaDto = FacebookPolicyAnalyzeMediaDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], FacebookPolicyAnalyzeMediaDto.prototype, "caption", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['image', 'video', 'transcript']),
    __metadata("design:type", String)
], FacebookPolicyAnalyzeMediaDto.prototype, "mediaType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50000),
    __metadata("design:type", String)
], FacebookPolicyAnalyzeMediaDto.prototype, "transcript", void 0);
//# sourceMappingURL=facebook-policy.dto.js.map