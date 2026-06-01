import React from 'react';
import InputForm from './downloader/InputForm';
import LoadingState from './downloader/LoadingState';
import ResultsState from './downloader/ResultsState';
import FailedState from './downloader/FailedState';

export default function DownloaderCard({
  activeJob,
  handleConvert,
  activeTab,
  setActiveTab,
  setErrorMsg,
  urlInput,
  setUrlInput,
  batchUrls,
  setBatchUrls,
  pasteFromClipboard,
  resetPrimaryJob,
  handleMuxDownload
}) {
  return (
    <section className="max-w-3xl mx-auto px-gutter pb-16">
      <div className="bg-surface-muted border border-hairline rounded-xl p-6 md:p-8 shadow-2xl relative overflow-hidden state-transition" id="downloader-card">
        
        {/* 1. INPUT INITIAL STATE */}
        {!activeJob && (
          <InputForm
            handleConvert={handleConvert}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            setErrorMsg={setErrorMsg}
            urlInput={urlInput}
            setUrlInput={setUrlInput}
            batchUrls={batchUrls}
            setBatchUrls={setBatchUrls}
            pasteFromClipboard={pasteFromClipboard}
          />
        )}

        {/* 2. LOADING STATE */}
        {activeJob && (activeJob.status === 'waiting' || activeJob.status === 'active') && (
          <LoadingState activeJob={activeJob} />
        )}

        {/* 3. RESULTS STATE */}
        {activeJob && activeJob.status === 'completed' && (
          <ResultsState
            activeJob={activeJob}
            resetPrimaryJob={resetPrimaryJob}
            handleMuxDownload={handleMuxDownload}
          />
        )}

        {/* 4. FAILED STATE */}
        {activeJob && activeJob.status === 'failed' && (
          <FailedState
            activeJob={activeJob}
            resetPrimaryJob={resetPrimaryJob}
          />
        )}

      </div>
    </section>
  );
}
