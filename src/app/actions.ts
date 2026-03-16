'use server';

import { correctMedicalTerms, type CorrectMedicalTermsInput } from '@/ai/flows/medical-auto-correction';

export async function runAutoCorrection(input: CorrectMedicalTermsInput) {
  try {
    return await correctMedicalTerms(input);
  } catch (error) {
    console.error("Error in runAutoCorrection:", error);
    return { error: "Failed to run auto-correction." };
  }
}
