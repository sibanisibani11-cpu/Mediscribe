'use server';

/**
 * @fileOverview An AI agent to identify key medical terms in a transcript.
 *
 * - identifyKeyTerms - A function that identifies key terms in a medical record.
 * - IdentifyKeyTermsInput - The input type for the identifyKeyTerms function.
 * - IdentifyKeyTermsOutput - The return type for the identifyKeyTerms function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const IdentifyKeyTermsInputSchema = z.string().describe('The medical record transcript.');
export type IdentifyKeyTermsInput = z.infer<typeof IdentifyKeyTermsInputSchema>;

const IdentifyKeyTermsOutputSchema = z.object({
  keyTerms: z.array(z.string()).describe('An array of key medical terms identified in the transcript.'),
});
export type IdentifyKeyTermsOutput = z.infer<typeof IdentifyKeyTermsOutputSchema>;

export async function identifyKeyTerms(input: IdentifyKeyTermsInput): Promise<IdentifyKeyTermsOutput> {
  return identifyKeyTermsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'identifyKeyTermsPrompt',
  input: {schema: IdentifyKeyTermsInputSchema},
  output: {schema: IdentifyKeyTermsOutputSchema},
  prompt: `You are an expert medical summarizer. Your job is to identify the key medical terms in a medical record transcript and return them as an array of strings.

Transcript: {{{$input}}}`,
});

const identifyKeyTermsFlow = ai.defineFlow(
  {
    name: 'identifyKeyTermsFlow',
    inputSchema: IdentifyKeyTermsInputSchema,
    outputSchema: IdentifyKeyTermsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
