'use client';

import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  AutopilotBriefForm,
  type AutopilotBriefFormState,
} from '@/components/marketing-autopilot/autopilot-brief-form';
import type { AutopilotFormOptions, MarketingContextSnapshot } from '@/types/marketing-autopilot';
import type { UseMutationResult } from '@tanstack/react-query';
import type { MarketingAutopilotProject, MarketingAutopilotProjectInput } from '@/types/marketing-autopilot';

type Props = {
  form: AutopilotBriefFormState;
  setForm: React.Dispatch<React.SetStateAction<AutopilotBriefFormState>>;
  defaultForm: AutopilotBriefFormState;
  formOptions?: AutopilotFormOptions;
  snapshot?: MarketingContextSnapshot;
  enabled: boolean;
  createProject: UseMutationResult<
    MarketingAutopilotProject,
    Error,
    MarketingAutopilotProjectInput,
    unknown
  >;
  onCreated: (projectId: string) => void;
};

export function AutopilotCreateTab({
  form,
  setForm,
  defaultForm,
  formOptions,
  snapshot,
  enabled,
  createProject,
  onCreated,
}: Props) {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2.5 p-4 sm:p-4">
        <p className="shrink-0 text-xs text-muted-foreground">
          Nhập brief marketing — AI phân tích và lưu project.
        </p>

        <div className="min-h-0 flex-1">
          <AutopilotBriefForm
            options={formOptions}
            form={form}
            setForm={setForm}
            snapshot={snapshot}
            compact
          />
        </div>

        {createProject.isError ? (
          <Alert variant="destructive" className="shrink-0 py-2">
            <AlertTitle className="text-sm">Không lưu được project</AlertTitle>
            <AlertDescription className="text-xs">
              {(createProject.error as Error).message}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
          <Button
            size="sm"
            className="h-9"
            disabled={
              !enabled ||
              createProject.isPending ||
              !form.productName.trim() ||
              !form.primaryGoal.trim() ||
              !form.customerProfile.trim() ||
              !form.targetArea.trim() ||
              !(form.monthlyBudget > 0)
            }
            onClick={() => {
              if (createProject.isPending) return;
              createProject.mutate(
                {
                  projectName: form.projectName,
                  productName: form.productName,
                  productPrice: form.productPrice,
                  customerProfile: form.customerProfile,
                  targetArea: form.targetArea,
                  monthlyBudget: form.monthlyBudget,
                  primaryGoal: form.primaryGoal,
                },
                {
                  onSuccess: (project) => onCreated(project.id),
                },
              );
            }}
          >
            {createProject.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang phân tích...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Phân tích và lưu project
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setForm(defaultForm)}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
