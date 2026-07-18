import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import StartScreen from './steps/StartScreen.jsx';
import MetadataStep from './steps/MetadataStep.jsx';
import ApiListStep from './steps/ApiListStep.jsx';
import EventsStep from './steps/EventsStep.jsx';
import ReviewStep from './steps/ReviewStep.jsx';
import SetupGuide from './SetupGuide.jsx';
import { stateFromComponent } from './parseComponent.js';

const STEPS = ['Metadata', 'Exposed APIs', 'Dependent APIs', 'Events', 'Review & Save'];

function blankState() {
  return {
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    status: 'roadmap',
    publicationDate: new Date().toISOString().slice(0, 10),
    functionalBlock: '',
    owners: [],
    maintainers: [],
    eTOMs: [],
    functionalFrameworkFunctions: [],
    SIDs: [],
    exposedAPIs: [{ id: '', apiSDO: 'tmForum', required: true, name: '', specifications: [{ version: '', resources: [], raw: {} }] }],
    dependentAPIs: [],
    publishedEvents: [],
    subscribedEvents: [],
  };
}

export default function App() {
  const [view, setView] = useState('wizard'); // 'wizard' | 'setup'
  const [mode, setMode] = useState(null); // null | 'new' | 'edit'
  const [step, setStep] = useState(0);
  const [state, setState] = useState(blankState());
  const [original, setOriginal] = useState(null); // raw loaded component, for edit mode
  const [originalLocation, setOriginalLocation] = useState(null); // { dirName, fileName }
  const [functionalBlocks, setFunctionalBlocks] = useState([]);
  const [apiCatalog, setApiCatalog] = useState([]);
  const [repoInfo, setRepoInfo] = useState(null);

  const refreshRepoInfo = () => api.health().then(setRepoInfo).catch(() => setRepoInfo({ ok: false }));

  useEffect(() => {
    refreshRepoInfo();
    api.functionalBlocks().then((r) => setFunctionalBlocks(r.functionalBlocks)).catch(() => {});
    api.apis().then((r) => setApiCatalog(r.apis)).catch(() => {});
  }, []);

  const startCreate = () => {
    setOriginal(null);
    setOriginalLocation(null);
    setState(blankState());
    api.nextId().then((r) => setState((s) => ({ ...s, id: r.id }))).catch(() => {});
    setMode('new');
    setStep(0);
  };

  const startEdit = ({ component, dirName, fileName }) => {
    setOriginal(component);
    setOriginalLocation({ dirName, fileName });
    setState(stateFromComponent(component));
    setMode('edit');
    setStep(0);
  };

  const backToStart = () => {
    setMode(null);
    setStep(0);
  };

  return (
    <div className="app">
      <h1>ODA Component Specification Studio</h1>
      {repoInfo?.git && (repoInfo.git.remote || repoInfo.git.branch) && (
        <p className="repo-connection">
          Connected to{' '}
          {repoInfo.git.remoteUrl ? (
            <a href={repoInfo.git.remoteUrl} target="_blank" rel="noreferrer">{repoInfo.git.remote}</a>
          ) : (
            <strong>{repoInfo.git.remote || 'unknown repo'}</strong>
          )}
          {repoInfo.git.branch && <> on branch <code>{repoInfo.git.branch}</code></>}
        </p>
      )}
      <p className="subtitle">
        Create or edit a TMFCxxx component specification for the ODA Component Specification repository.
        {repoInfo && !repoInfo.specificationsDirExists && (
          <span style={{ color: 'var(--danger)' }}> Warning: specifications folder not found at configured REPO_ROOT.</span>
        )}
      </p>

      <div className="steps">
        <button className={`step-pill ${view === 'wizard' ? 'active' : ''}`} onClick={() => setView('wizard')}>Studio</button>
        <button className={`step-pill ${view === 'setup' ? 'active' : ''}`} onClick={() => setView('setup')}>Setup instructions</button>
      </div>

      {view === 'setup' && (
        <SetupGuide repoInfo={repoInfo} onFrameworksRegenerated={refreshRepoInfo} />
      )}

      {view === 'wizard' && mode === null && (
        <StartScreen onCreateNew={startCreate} onEditExisting={startEdit} />
      )}

      {view === 'wizard' && mode !== null && (
        <>
          <div className="steps">
            <button className="step-pill" onClick={backToStart}>&larr; Start over</button>
            {STEPS.map((label, i) => (
              <button
                key={label}
                className={`step-pill ${i === step ? 'active' : ''}`}
                onClick={() => setStep(i)}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>

          {mode === 'edit' && (
            <div className="status-banner ok" style={{ marginBottom: 16 }}>
              Editing existing component {originalLocation?.dirName}. ID and name are locked to avoid orphaning its conformance profile/RI/diagram folders.
            </div>
          )}

          {step === 0 && (
            <MetadataStep
              state={state}
              setState={setState}
              functionalBlocks={functionalBlocks}
              locked={mode === 'edit'}
              dirName={originalLocation?.dirName}
            />
          )}
          {step === 1 && (
            <ApiListStep
              title="Exposed APIs"
              requiredMeaning="Mandatory for Conformance"
              items={state.exposedAPIs}
              onChange={(v) => setState({ ...state, exposedAPIs: v })}
              apiCatalog={apiCatalog}
            />
          )}
          {step === 2 && (
            <ApiListStep
              title="Dependent APIs"
              requiredMeaning="Mandatory Dependency"
              items={state.dependentAPIs}
              onChange={(v) => setState({ ...state, dependentAPIs: v })}
              apiCatalog={apiCatalog}
            />
          )}
          {step === 3 && (
            <EventsStep state={state} setState={setState} apiCatalog={apiCatalog} />
          )}
          {step === 4 && (
            <ReviewStep state={state} original={original} originalLocation={originalLocation} mode={mode} />
          )}

          <div className="nav-buttons">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
            <button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
