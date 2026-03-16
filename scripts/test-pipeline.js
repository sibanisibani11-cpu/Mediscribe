const { nspell } = require('nspell');
const fs = require('fs');

async function testPipeline() {
    console.log('🧪 Starting MediScribe 3-Stage Pipeline Simulation...\n');

    // 1. MOCK STAGE 2: Spelling Error Detection
    // Simulating initialization
    const mockMedicalTerms = ['patient', 'levothyroxine', 'hypothyroidism', 'mediscribe'];
    const { default: dict } = await import('dictionary-en');
    const spellChecker = require('nspell')(dict);
    mockMedicalTerms.forEach(t => spellChecker.add(t));

    const transcriptions = [
        { name: 'Clean Medical Text', text: 'The patient is taking levothyroxine for hypothyroidism.' },
        { name: 'Minor Errors (LLM Needed)', text: 'The ptient is taking levothiroxine for hypothyrroidism.' },
        { name: 'Nonsense/Noise', text: 'um ah the ptient is...' }
    ];

    for (const test of transcriptions) {
        console.log(`--- Test: ${test.name} ---`);
        console.log(`Input: "${test.text}"`);

        // Stage 2: Detection
        const words = test.text.split(/\b/);
        const errors = [];
        words.forEach(word => {
            if (/[a-zA-Z]{2,}/.test(word)) {
                if (!spellChecker.correct(word) && !spellChecker.correct(word.toLowerCase())) {
                    errors.push({ word, suggestions: spellChecker.suggest(word).slice(0, 2) });
                }
            }
        });

        if (errors.length === 0) {
            console.log('✅ Stage 2 Result: No errors detected. SKIPPING LLM (Speed: ~0.1s)');
        } else {
            console.log(`⚠️ Stage 2 Result: Found ${errors.length} errors: [${errors.map(e => e.word).join(', ')}]`);
            console.log('🚀 Stage 3 Action: Calling LLM with Restricted Mode prompt...');
            // Simulated LLM output
            console.log('✅ Simulated Output: "The patient is taking levothyroxine for hypothyroidism."');
        }
        console.log('\n');
    }
}

testPipeline().catch(console.error);
