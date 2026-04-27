import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Briefcase, FolderTree } from 'lucide-react';
import { Positions } from './Positions';
import { DepsGroup } from './DepsGroup';
import { useI18n } from '../../i18n/I18nContext';

export function EmployeeSettings() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.employeeSettings.title')}</h1>
        <p className="text-gray-500">{t('page.employeeSettings.description')}</p>
      </div>

      <Tabs defaultValue="positions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="positions">
            <Briefcase className="mr-2 h-4 w-4" />
            {t('page.employeeSettings.tab.positions')}
          </TabsTrigger>
          <TabsTrigger value="departments">
            <FolderTree className="mr-2 h-4 w-4" />
            {t('page.employeeSettings.tab.departments')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="space-y-4">
          <Positions embedded />
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <DepsGroup embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
