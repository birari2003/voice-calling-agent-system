import { LANGUAGES, type QuestionnaireContent } from './types.js';

/**
 * Version 1 questionnaire wording. It is copied into `questionnaire_versions` the first time an
 * organization starts a session, so later edits never change what an old transcript was based on.
 *
 * Assamese and Hindi wording must be reviewed by fluent speakers before any real-citizen use.
 */
export const DEFAULT_QUESTIONNAIRE: QuestionnaireContent = {
  defaultLanguage: 'as',
  maxClarificationAttempts: 2,
  languages: {
    en: {
      greeting: 'Namaskar! Welcome to NagarSeva, the municipal complaint service.',
      disclosure:
        'You are speaking with an AI assistant that registers municipal complaints. This is a test simulation: the written transcript is saved, and no audio is recorded. Say "stop" at any time to end without registering a complaint.',
      askIssue: 'What problem would you like to report?',
      clarifyIssue:
        'Please describe the problem in a little more detail, for example what is wrong and since when.',
      askLocation:
        'Where is the problem? Please tell the area, colony or road name, and the ward number if you know it.',
      clarifyLocality:
        'I could not understand the location. Please tell the area, colony or road name.',
      askLandmark: 'What is the nearest landmark? Say "skip" if there is none.',
      askName: 'May I have your name, please?',
      clarifyName: 'Please tell me your name using letters only.',
      readBack:
        'Let me read back the details. Problem: {issue}. Location: {locality}{ward}{landmark}. Name: {name}.',
      readBackWard: ', ward {ward}',
      readBackLandmark: ', near {landmark}',
      askConfirmation: 'Are these details correct? Please answer yes or no.',
      clarifyConfirmation: 'Please answer only yes or no. Are these details correct?',
      askCorrectionField:
        'Which detail should be corrected? Say 1 for the problem, 2 for the location, or 3 for the name.',
      clarifyCorrectionField:
        'Please say 1 for the problem, 2 for the location, or 3 for the name.',
      ticketCreated:
        'Thank you. Your complaint has been registered. Your ticket number is {ticketId}.',
      simulationNotice:
        'This was a test simulation. No real call was made and no WhatsApp message has been sent.',
      cancelled: 'Okay, I have stopped. No complaint has been registered. Thank you.',
      handoff:
        'I am sorry, I could not complete this registration. No complaint has been registered. Please contact the municipal office or try again later.',
      languageDefaulted: 'I will continue in English.',
      chooseLanguage: 'For English, say 3, or say English.',
      didNotHear: 'Sorry, I could not hear that clearly. Could you please say it again?',
    },
    hi: {
      greeting: 'नमस्कार! नगरसेवा, नगर निगम शिकायत सेवा में आपका स्वागत है।',
      disclosure:
        'आप एक AI सहायक से बात कर रहे हैं जो नगर निगम की शिकायतें दर्ज करता है। यह एक परीक्षण सिमुलेशन है: बातचीत का लिखित रिकॉर्ड सहेजा जाता है, कोई ऑडियो रिकॉर्ड नहीं किया जाता। शिकायत दर्ज किए बिना समाप्त करने के लिए कभी भी "रुको" या "stop" कहें।',
      askIssue: 'आप किस समस्या की शिकायत करना चाहते हैं?',
      clarifyIssue: 'कृपया समस्या थोड़ा विस्तार से बताएं, जैसे क्या खराब है और कब से।',
      askLocation: 'समस्या कहाँ है? कृपया इलाका, कॉलोनी या सड़क का नाम और पता हो तो वार्ड नंबर बताएं।',
      clarifyLocality: 'मैं स्थान समझ नहीं पाया। कृपया इलाके, कॉलोनी या सड़क का नाम बताएं।',
      askLandmark: 'सबसे नज़दीकी पहचान का स्थान (लैंडमार्क) क्या है? अगर नहीं है तो "छोड़ें" कहें।',
      askName: 'कृपया अपना नाम बताएं।',
      clarifyName: 'कृपया केवल अक्षरों में अपना नाम बताएं।',
      readBack: 'मैं विवरण दोहराता हूँ। समस्या: {issue}। स्थान: {locality}{ward}{landmark}। नाम: {name}।',
      readBackWard: ', वार्ड {ward}',
      readBackLandmark: ', {landmark} के पास',
      askConfirmation: 'क्या ये विवरण सही हैं? कृपया हाँ या नहीं में उत्तर दें।',
      clarifyConfirmation: 'कृपया केवल हाँ या नहीं कहें। क्या ये विवरण सही हैं?',
      askCorrectionField:
        'कौन सा विवरण ठीक करना है? समस्या के लिए 1, स्थान के लिए 2, या नाम के लिए 3 कहें।',
      clarifyCorrectionField: 'कृपया समस्या के लिए 1, स्थान के लिए 2, या नाम के लिए 3 कहें।',
      ticketCreated: 'धन्यवाद। आपकी शिकायत दर्ज हो गई है। आपका टिकट नंबर {ticketId} है।',
      simulationNotice:
        'यह एक परीक्षण सिमुलेशन था। कोई वास्तविक कॉल नहीं की गई और कोई WhatsApp संदेश नहीं भेजा गया।',
      cancelled: 'ठीक है, मैंने बातचीत रोक दी है। कोई शिकायत दर्ज नहीं की गई। धन्यवाद।',
      handoff:
        'क्षमा करें, मैं यह शिकायत दर्ज नहीं कर सका। कोई शिकायत दर्ज नहीं हुई है। कृपया नगर निगम कार्यालय से संपर्क करें या बाद में फिर कोशिश करें।',
      languageDefaulted: 'मैं हिंदी में बात जारी रखूँगा।',
      chooseLanguage: 'हिंदी के लिए 2 या हिंदी कहें।',
      didNotHear: 'क्षमा करें, मैं ठीक से सुन नहीं पाया। कृपया फिर से बताएं।',
    },
    as: {
      greeting: 'নমস্কাৰ! নগৰসেৱা, পৌৰ নিগমৰ অভিযোগ সেৱালৈ আপোনাক স্বাগতম।',
      disclosure:
        'আপুনি পৌৰ অভিযোগ পঞ্জীয়ন কৰা এটা AI সহায়কৰ সৈতে কথা পাতি আছে। এইটো এটা পৰীক্ষামূলক ছিমুলেচন: কথা-বতৰাৰ লিখিত ৰেকৰ্ড সংৰক্ষণ কৰা হয়, কোনো অডিঅ’ ৰেকৰ্ড কৰা নহয়। অভিযোগ পঞ্জীয়ন নকৰাকৈ যিকোনো সময়ত বন্ধ কৰিবলৈ "বন্ধ" বা "stop" কওক।',
      askIssue: 'আপুনি কি সমস্যাৰ বিষয়ে অভিযোগ কৰিব বিচাৰে?',
      clarifyIssue: 'অনুগ্ৰহ কৰি সমস্যাটো অলপ বিতংভাৱে কওক, যেনে কি বেয়া হৈছে আৰু কেতিয়াৰ পৰা।',
      askLocation: 'সমস্যাটো ক’ত? অনুগ্ৰহ কৰি অঞ্চল, কলনী বা পথৰ নাম আৰু জানিলে ৱাৰ্ড নম্বৰ কওক।',
      clarifyLocality: 'মই ঠাইখন বুজি নাপালোঁ। অনুগ্ৰহ কৰি অঞ্চল, কলনী বা পথৰ নাম কওক।',
      askLandmark: 'ওচৰৰ চিনাকি ঠাই (লেণ্ডমাৰ্ক) কি? নাথাকিলে "বাদ দিয়ক" কওক।',
      askName: 'অনুগ্ৰহ কৰি আপোনাৰ নাম কওক।',
      clarifyName: 'অনুগ্ৰহ কৰি কেৱল আখৰেৰে আপোনাৰ নাম কওক।',
      readBack:
        'মই বিৱৰণবোৰ পুনৰ পঢ়ি শুনাইছোঁ। সমস্যা: {issue}। ঠাই: {locality}{ward}{landmark}। নাম: {name}।',
      readBackWard: ', ৱাৰ্ড {ward}',
      readBackLandmark: ', {landmark}ৰ ওচৰত',
      askConfirmation: 'এই বিৱৰণবোৰ শুদ্ধ নে? অনুগ্ৰহ কৰি হয় বা নহয় বুলি উত্তৰ দিয়ক।',
      clarifyConfirmation: 'অনুগ্ৰহ কৰি কেৱল হয় বা নহয় কওক। এই বিৱৰণবোৰ শুদ্ধ নে?',
      askCorrectionField: 'কোনটো বিৱৰণ শুধৰাব লাগে? সমস্যাৰ বাবে 1, ঠাইৰ বাবে 2, নামৰ বাবে 3 কওক।',
      clarifyCorrectionField: 'অনুগ্ৰহ কৰি সমস্যাৰ বাবে 1, ঠাইৰ বাবে 2, নামৰ বাবে 3 কওক।',
      ticketCreated: 'ধন্যবাদ। আপোনাৰ অভিযোগ পঞ্জীয়ন কৰা হ’ল। আপোনাৰ টিকট নম্বৰ {ticketId}।',
      simulationNotice:
        'এইটো এটা পৰীক্ষামূলক ছিমুলেচন আছিল। কোনো প্ৰকৃত কল কৰা হোৱা নাই আৰু কোনো WhatsApp বাৰ্তা পঠিওৱা হোৱা নাই।',
      cancelled: 'ঠিক আছে, মই বন্ধ কৰিলোঁ। কোনো অভিযোগ পঞ্জীয়ন কৰা হোৱা নাই। ধন্যবাদ।',
      handoff:
        'দুঃখিত, মই এই পঞ্জীয়ন সম্পূৰ্ণ কৰিব নোৱাৰিলোঁ। কোনো অভিযোগ পঞ্জীয়ন হোৱা নাই। অনুগ্ৰহ কৰি পৌৰ নিগমৰ কাৰ্যালয়ৰ সৈতে যোগাযোগ কৰক বা পিছত আকৌ চেষ্টা কৰক।',
      languageDefaulted: 'মই অসমীয়াত কথা পাতি থাকিম।',
      chooseLanguage: 'অসমীয়াত কথা পাতিবলৈ 1 বা অসমীয়া বুলি কওক।',
      didNotHear: 'দুঃখিত, মই ভালদৰে শুনিব নোৱাৰিলোঁ। অনুগ্ৰহ কৰি আকৌ এবাৰ কওক।',
    },
  },
};

/**
 * Fills wording keys added after a questionnaire version was stored (for example
 * `chooseLanguage` and `didNotHear` in Phase 5) from the defaults, without changing stored text.
 */
export function withDefaultWording(content: QuestionnaireContent): QuestionnaireContent {
  return {
    ...DEFAULT_QUESTIONNAIRE,
    ...content,
    languages: Object.fromEntries(
      LANGUAGES.map((code) => [
        code,
        { ...DEFAULT_QUESTIONNAIRE.languages[code], ...content.languages?.[code] },
      ]),
    ) as QuestionnaireContent['languages'],
  };
}
