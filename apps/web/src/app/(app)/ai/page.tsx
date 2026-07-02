import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';

export default function AiMarketingPage() {
  return (
    <div>
      <PageHeader title="AI Marketing" description="Gợi ý chiến dịch và nội dung thông minh" />
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <CardTitle>AI Marketing sắp ra mắt</CardTitle>
          <CardDescription>
            Module AI đang được phát triển. Sẽ tích hợp gợi ý nội dung, phân tích lead và tối ưu
            chiến dịch ads.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Backend AI service placeholder đã sẵn sàng trong monorepo.
        </CardContent>
      </Card>
    </div>
  );
}
