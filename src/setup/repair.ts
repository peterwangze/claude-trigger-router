export type SetupRepairField = 'defaultModel' | 'apiKey' | 'apiBaseUrl' | 'capabilityHints' | 'manualReview';

function mapRepairField(error: string): SetupRepairField {
  if (error === 'Router.default is required') {
    return 'defaultModel';
  }

  if (/^(Providers\[\d+\]\.api_key|Models\[\d+\]\.key) is required$/.test(error)) {
    return 'apiKey';
  }

  if (/^(Providers\[\d+\]\.api_base_url|Models\[\d+\]\.api) is required$/.test(error)) {
    return 'apiBaseUrl';
  }

  if (
    /^Models\[\d+\]\.thinking is configured, but model ".+" disables reasoning\./.test(error) ||
    /^Models\[\d+\]\.metadata\.supports_tools disables tools/.test(error) ||
    /^Models\[\d+\]\.metadata\.supports_images disables image input/.test(error)
  ) {
    return 'capabilityHints';
  }

  return 'manualReview';
}

export function getRepairFields(errors: string[]): SetupRepairField[] {
  const fields: SetupRepairField[] = [];

  for (const error of errors) {
    const field = mapRepairField(error);
    if (!fields.includes(field)) {
      fields.push(field);
    }
  }

  return fields;
}
