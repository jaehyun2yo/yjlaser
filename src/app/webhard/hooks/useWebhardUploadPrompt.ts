import { useEffect, useRef, useState } from 'react';
import type { WebhardFile } from '@/types/webhard';
import { shouldShowUploadLinkPrompt } from '@/app/webhard/_lib/webhardMainContracts';
import { logger } from '@/lib/utils/logger';

const uploadPromptLog = logger.createLogger('WebhardUploadPrompt');

interface LinkPromptFile {
  id: string;
  name: string;
}

interface UseWebhardUploadPromptOptions {
  files: WebhardFile[];
  isUploading: boolean;
  userType: 'admin' | 'company';
  userId: string;
}

export function useWebhardUploadPrompt({
  files,
  isUploading,
  userType,
  userId,
}: UseWebhardUploadPromptOptions) {
  const [linkPromptFile, setLinkPromptFile] = useState<LinkPromptFile | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [companyNameForLink, setCompanyNameForLink] = useState('');
  const prevIsUploadingRef = useRef(false);

  useEffect(() => {
    if (userType !== 'company') return;
    fetch(`/nestapi/folders/company-info/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { companyName?: string } | null) => {
        if (data?.companyName) setCompanyNameForLink(data.companyName);
      })
      .catch((error: unknown) => {
        uploadPromptLog.warn('Failed to load company info for link prompt', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [userType, userId]);

  useEffect(() => {
    const recentCutoff = Date.now() - 120_000;
    const recentFile = files.find(
      (file) => !('isPending' in file) && new Date(file.created_at).getTime() > recentCutoff
    );
    const shouldShow = shouldShowUploadLinkPrompt({
      previousIsUploading: prevIsUploadingRef.current,
      isUploading,
      userType,
      hasRecentFile: Boolean(recentFile),
    });

    if (shouldShow && recentFile) {
      setLinkPromptFile({
        id: recentFile.id,
        name: recentFile.original_name || recentFile.name,
      });
    }
    prevIsUploadingRef.current = isUploading;
  }, [files, isUploading, userType]);

  useEffect(() => {
    if (!linkPromptFile) return;
    const timer = setTimeout(() => setLinkPromptFile(null), 30_000);
    return () => clearTimeout(timer);
  }, [linkPromptFile]);

  return {
    companyNameForLink,
    linkModalOpen,
    linkPromptFile,
    setLinkModalOpen,
    setLinkPromptFile,
  };
}
