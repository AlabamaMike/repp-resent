'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProject, createProjectFromDocument, getTemplate } from '@/lib/api';
import { Loader2, Plus, X, FileText, Zap, Download } from 'lucide-react';

type Mode = 'quick' | 'advanced';

export default function NewProject() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('quick');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick mode state
  const [targetCompany, setTargetCompany] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);
  const [clientName, setClientName] = useState('');
  const [objective, setObjective] = useState('');

  // Advanced mode state
  const [document, setDocument] = useState('');
  const [format, setFormat] = useState<'json' | 'yaml'>('json');

  const addQuestion = () => {
    setQuestions([...questions, '']);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = value;
    setQuestions(newQuestions);
  };

  const loadTemplate = async () => {
    try {
      const template = await getTemplate(format);
      setDocument(template);
    } catch (err) {
      setError('Failed to load template');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let result;

      if (mode === 'quick') {
        const validQuestions = questions.filter(q => q.trim());
        if (!targetCompany.trim()) {
          throw new Error('Target company is required');
        }
        if (validQuestions.length === 0) {
          throw new Error('At least one research question is required');
        }

        result = await createProject({
          targetCompany: targetCompany.trim(),
          questions: validQuestions,
          clientName: clientName.trim() || undefined,
          objective: objective.trim() || undefined,
        });
      } else {
        if (!document.trim()) {
          throw new Error('Scoping document is required');
        }
        result = await createProjectFromDocument(document, format);
      }

      router.push(`/projects/${result.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">New Research Project</h1>
      <p className="text-gray-600 mb-8">Start a new commercial research workflow on a target company</p>

      {/* Mode Toggle */}
      <div className="flex space-x-2 mb-6">
        <button
          onClick={() => setMode('quick')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'quick'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Quick Start</span>
        </button>
        <button
          onClick={() => setMode('advanced')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'advanced'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Advanced</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6">
        {mode === 'quick' ? (
          <div className="space-y-6">
            {/* Target Company */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Company *
              </label>
              <input
                type="text"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="e.g., Acme Corporation"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            {/* Research Objective */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Research Objective
              </label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g., Evaluate Acme Corporation as a potential acquisition target"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Client Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Internal or client name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Research Questions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Key Research Questions *
              </label>
              <div className="space-y-3">
                {questions.map((question, index) => (
                  <div key={index} className="flex space-x-2">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => updateQuestion(index, e.target.value)}
                      placeholder={`Question ${index + 1}`}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuestion(index)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addQuestion}
                className="mt-3 flex items-center space-x-1 text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Add Question</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Format
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="json"
                    checked={format === 'json'}
                    onChange={() => setFormat('json')}
                    className="mr-2"
                  />
                  JSON
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="yaml"
                    checked={format === 'yaml'}
                    onChange={() => setFormat('yaml')}
                    className="mr-2"
                  />
                  YAML
                </label>
              </div>
            </div>

            {/* Template Button */}
            <button
              type="button"
              onClick={loadTemplate}
              className="flex items-center space-x-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              <span>Load Template</span>
            </button>

            {/* Document Editor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scoping Document *
              </label>
              <textarea
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder={format === 'json' ? '{\n  "projectName": "...",\n  ...\n}' : 'projectName: ...\n...'}
                rows={20}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                required
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-400 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Starting Research...</span>
              </>
            ) : (
              <>
                <span>Start Research</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
