'use server';

/**
 * @fileOverview Implements a Genkit flow for automatically correcting medical word typo errors or misspelled words.
 *
 * - correctMedicalTerms - A function that handles the correction of medical terms.
 * - CorrectMedicalTermsInput - The input type for the correctMedicalTerms function.
 * - CorrectMedicalTermsOutput - The return type for the correctMedicalTerms function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CorrectMedicalTermsInputSchema = z.object({
  text: z.string().describe('The text containing potentially misspelled medical terms.'),
});
export type CorrectMedicalTermsInput = z.infer<typeof CorrectMedicalTermsInputSchema>;

const CorrectMedicalTermsOutputSchema = z.object({
  correctedText: z.string().describe('The text with medical terms corrected.'),
});
export type CorrectMedicalTermsOutput = z.infer<typeof CorrectMedicalTermsOutputSchema>;

export async function correctMedicalTerms(input: CorrectMedicalTermsInput): Promise<CorrectMedicalTermsOutput> {
  return correctMedicalTermsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'correctMedicalTermsPrompt',
  input: {schema: CorrectMedicalTermsInputSchema},
  output: {schema: CorrectMedicalTermsOutputSchema},
  prompt: `You are a medical terminology expert.  You will be given a block of text that
may contain medical terms that are misspelled.  Correct any misspelled medical terms in the text.

Text: {{{text}}}
`,
});

const correctMedicalTermsFlow = ai.defineFlow(
  {
    name: 'correctMedicalTermsFlow',
    inputSchema: CorrectMedicalTermsInputSchema,
    outputSchema: CorrectMedicalTermsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
