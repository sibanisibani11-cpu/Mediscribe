'use server';

/**
 * @fileOverview This flow uses GenAI to accurately interpret complex medical terms and jargon during transcription.
 *
 * - medicalTerminologyAssistance - A function that handles the medical terminology assistance process.
 * - MedicalTerminologyAssistanceInput - The input type for the medicalTerminologyAssistance function.
 * - MedicalTerminologyAssistanceOutput - The return type for the medicalTerminologyAssistance function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MedicalTerminologyAssistanceInputSchema = z.object({
  transcriptionText: z
    .string()
    .describe(
      'The transcribed text that needs to be reviewed for medical terminology accuracy.'
    ),
});
export type MedicalTerminologyAssistanceInput = z.infer<
  typeof MedicalTerminologyAssistanceInputSchema
>;

const MedicalTerminologyAssistanceOutputSchema = z.object({
  correctedText: z
    .string()
    .describe('The corrected text with accurate medical terminology.'),
  keyTerms: z.array(z.string()).describe('List of identified key medical terms.'),
});
export type MedicalTerminologyAssistanceOutput = z.infer<
  typeof MedicalTerminologyAssistanceOutputSchema
>;

export async function medicalTerminologyAssistance(
  input: MedicalTerminologyAssistanceInput
): Promise<MedicalTerminologyAssistanceOutput> {
  return medicalTerminologyAssistanceFlow(input);
}

const medicalTerminologyAssistancePrompt = ai.definePrompt({
  name: 'medicalTerminologyAssistancePrompt',
  input: {schema: MedicalTerminologyAssistanceInputSchema},
  output: {schema: MedicalTerminologyAssistanceOutputSchema},
  prompt: `You are an expert medical terminology assistant. Review the following transcribed text for accuracy of medical terms and jargon. Correct any inaccuracies and identify the key medical terms used.

Transcribed Text: {{{transcriptionText}}}

Corrected Text:
Key Terms:`, // Ensure correctedText and keyTerms are populated by the model.
});

const medicalTerminologyAssistanceFlow = ai.defineFlow(
  {
    name: 'medicalTerminologyAssistanceFlow',
    inputSchema: MedicalTerminologyAssistanceInputSchema,
    outputSchema: MedicalTerminologyAssistanceOutputSchema,
  },
  async input => {
    const {output} = await medicalTerminologyAssistancePrompt(input);
    return output!;
  }
);
