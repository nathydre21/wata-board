import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { migrationService } from '../services/migrationService';
import { MigrationStatus, MigrationConfig, EmergencyRecovery, EncryptedMigrationData } from '../types/migration';

export const AccountMigration: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'recovery'>('export');
  const [loading, setLoading] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [emergencyRecovery, setEmergencyRecovery] = useState<EmergencyRecovery | null>(null);
  const [migrationHistory, setMigrationHistory] = useState<MigrationStatus[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export configuration
  const [exportConfig, setExportConfig] = useState<MigrationConfig>({
    includeTransactionHistory: true,
    includePreferences: true,
    includeAssets: true,
    encryptionEnabled: true,
    compressionEnabled: true,
    backupBeforeMigration: true
  });

  // Import password
  const [importPassword, setImportPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  /**
   * Handle account data export
   */
  const handleExport = async () => {
    setLoading(true);
    try {
      const encrypted = await migrationService.exportAccountData(exportConfig);
      downloadFile(JSON.stringify(encrypted, null, 2), 'account-migration.json');
    } catch (error) {
      console.error('Export error:', error);
      alert(t('migration.export.error'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle file selection for import
   */
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  /**
   * Handle account data import
   */
  const handleImport = async () => {
    if (!selectedFile || !importPassword) {
      alert(t('migration.import.requiresPassword'));
      return;
    }

    setLoading(true);
    try {
      const content = await selectedFile.text();
      const encryptedData: EncryptedMigrationData = JSON.parse(content);
      const status = await migrationService.importAccountData(encryptedData, importPassword);
      setMigrationStatus(status);
      
      if (status.status === 'completed') {
        alert(t('migration.import.success'));
      } else {
        alert(t('migration.import.failed') + ': ' + status.error);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert(t('migration.import.error'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create emergency recovery
   */
  const handleCreateRecovery = async () => {
    setLoading(true);
    try {
      const recovery = await migrationService.createEmergencyRecovery();
      setEmergencyRecovery(recovery);
    } catch (error) {
      console.error('Recovery creation error:', error);
      alert(t('migration.recovery.creationError'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download file
   */
  const downloadFile = (content: string, filename: string) => {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  /**
   * Copy recovery phrase to clipboard
   */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(t('common.copied'));
  };

  /**
   * Load migration history
   */
  const loadMigrationHistory = async () => {
    setLoading(true);
    try {
      const history = await migrationService.getMigrationHistory();
      setMigrationHistory(history);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-400 mb-2">
            {t('migration.title')}
          </h1>
          <p className="text-slate-400">
            {t('migration.description')}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-slate-700">
          {(['export', 'import', 'recovery'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === tab
                  ? 'text-sky-400 border-b-2 border-sky-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {t(`migration.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-6">
              {t('migration.export.title')}
            </h2>

            {/* Configuration options */}
            <div className="space-y-4 mb-8">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportConfig.includeTransactionHistory}
                  onChange={(e) => setExportConfig({
                    ...exportConfig,
                    includeTransactionHistory: e.target.checked
                  })}
                  className="w-4 h-4"
                />
                <span className="text-slate-300">{t('migration.export.includeHistory')}</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportConfig.includePreferences}
                  onChange={(e) => setExportConfig({
                    ...exportConfig,
                    includePreferences: e.target.checked
                  })}
                  className="w-4 h-4"
                />
                <span className="text-slate-300">{t('migration.export.includePreferences')}</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportConfig.encryptionEnabled}
                  onChange={(e) => setExportConfig({
                    ...exportConfig,
                    encryptionEnabled: e.target.checked
                  })}
                  className="w-4 h-4"
                />
                <span className="text-slate-300">{t('migration.export.enableEncryption')}</span>
              </label>
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all"
            >
              {loading ? t('common.loading') : t('migration.export.button')}
            </button>

            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-300">
                {t('migration.export.warning')}
              </p>
            </div>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-6">
              {t('migration.import.title')}
            </h2>

            {/* File upload */}
            <div className="mb-6">
              <label className="block text-slate-300 font-medium mb-3">
                {t('migration.import.selectFile')}
              </label>
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 border-2 border-dashed border-slate-600 rounded-lg text-slate-300 transition-colors"
                >
                  {selectedFile ? selectedFile.name : t('migration.import.chooseFile')}
                </button>
              </div>
            </div>

            {/* Password input */}
            <div className="mb-6">
              <label className="block text-slate-300 font-medium mb-3">
                {t('migration.import.password')}
              </label>
              <input
                type="password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder={t('migration.import.passwordPlaceholder')}
              />
            </div>

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={loading || !selectedFile || !importPassword}
              className="w-full py-3 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all"
            >
              {loading ? t('common.loading') : t('migration.import.button')}
            </button>

            {/* Migration status */}
            {migrationStatus && (
              <div className="mt-6 p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">{t('migration.status')}</span>
                  <span className={`font-semibold ${
                    migrationStatus.status === 'completed' ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {migrationStatus.status}
                  </span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-sky-500 to-cyan-500 h-2 rounded-full transition-all"
                    style={{ width: `${migrationStatus.progress}%` }}
                  />
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  {migrationStatus.recordsProcessed} / {migrationStatus.totalRecords} {t('migration.recordsProcessed')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Recovery Tab */}
        {activeTab === 'recovery' && (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-6">
              {t('migration.recovery.title')}
            </h2>

            {!emergencyRecovery ? (
              <>
                <p className="text-slate-400 mb-6">
                  {t('migration.recovery.description')}
                </p>

                <button
                  onClick={handleCreateRecovery}
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all mb-6"
                >
                  {loading ? t('common.loading') : t('migration.recovery.createButton')}
                </button>
              </>
            ) : (
              <>
                {/* Recovery phrase */}
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <label className="block text-red-300 font-medium mb-3">
                    {t('migration.recovery.phrase')}
                  </label>
                  <div className="bg-slate-900 p-4 rounded border border-red-500/50 mb-3">
                    <code className="text-white font-mono">{emergencyRecovery.recoveryPhrase}</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(emergencyRecovery.recoveryPhrase)}
                    className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
                  >
                    {t('common.copy')}
                  </button>
                </div>

                {/* Recovery keys */}
                <div>
                  <label className="block text-slate-300 font-medium mb-3">
                    {t('migration.recovery.backupKeys')}
                  </label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {emergencyRecovery.backupKeys.map((key) => (
                      <div key={key.id} className="flex items-center gap-2 p-3 bg-slate-700/50 rounded border border-slate-600">
                        <code className="flex-1 text-sm text-slate-300 font-mono">{key.code}</code>
                        <button
                          onClick={() => copyToClipboard(key.code)}
                          className="px-3 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 rounded text-sm transition-colors"
                        >
                          {t('common.copy')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-sm text-amber-300">
                    {t('migration.recovery.warning')}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Migration History */}
        <button
          onClick={loadMigrationHistory}
          className="mt-8 px-6 py-2 text-sky-400 hover:text-sky-300 font-medium transition-colors"
        >
          {t('migration.history.load')}
        </button>

        {migrationHistory.length > 0 && (
          <div className="mt-8 bg-slate-800 rounded-lg p-8 border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-6">
              {t('migration.history.title')}
            </h3>
            <div className="space-y-4">
              {migrationHistory.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-slate-700/50 rounded border border-slate-600">
                  <div>
                    <p className="text-white font-medium">{item.id}</p>
                    <p className="text-sm text-slate-400">
                      {new Date(item.startedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded text-sm font-semibold ${
                    item.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                    item.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                    'bg-yellow-500/20 text-yellow-300'
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountMigration;
