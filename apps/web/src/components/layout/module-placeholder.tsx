import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';

export function ModulePlaceholder({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-muted-foreground">{name}</p>
        <p className="text-xs text-muted-foreground/70">{t('common.notImplemented')}</p>
      </CardContent>
    </Card>
  );
}
