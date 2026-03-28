// calculator.js — TaxCalculator: country-aware tax computation engine
// Each country has hardcoded logic due to non-uniform data structures.

export class TaxCalculator {
  constructor(countryData) {
    this.data = countryData;
    this.id = countryData.id;
    this.currency = countryData.currency;
  }

  // ─── Generic helpers ───────────────────────────────────────────────

  applyBrackets(income, brackets) {
    let tax = 0;
    let prev = 0;
    for (const b of brackets) {
      const upper = b.upTo === null ? income : Math.min(b.upTo, income);
      if (upper > prev) {
        tax += (upper - prev) * b.rate;
      }
      prev = b.upTo === null ? income : b.upTo;
      if (prev >= income) break;
    }
    return Math.max(0, tax);
  }

  applyFlatWithCap(income, rate, cap, exemption = 0) {
    const base = Math.max(0, Math.min(income, cap) - exemption);
    return base * rate;
  }

  applyFlat(income, rate) {
    return income * rate;
  }

  applyFlatBand(income, rate, from, to) {
    const base = Math.max(0, Math.min(income, to) - from);
    return base * rate;
  }

  applyFlatAboveThreshold(income, rate, threshold) {
    return Math.max(0, income - threshold) * rate;
  }

  applySurtax(provincialTax, tiers) {
    let surtax = 0;
    for (const t of tiers) {
      if (provincialTax > t.onProvincialTaxAbove) {
        surtax += (provincialTax - t.onProvincialTaxAbove) * t.rate;
      }
    }
    return surtax;
  }

  applyNonRefundableCredit(tax, creditAmount) {
    return Math.max(0, tax - creditAmount);
  }

  // ─── ONTARIO ───────────────────────────────────────────────────────

  calculateOntarioPass1(gross) {
    const layers = [];
    const fedBrackets = this.data.layers.find(l => l.id === 'federal_income_tax').brackets;
    const ontBrackets = this.data.layers.find(l => l.id === 'ontario_income_tax').brackets;
    const fedBpaData = this.data.layers.find(l => l.id === 'federal_bpa');
    const ontBpaData = this.data.layers.find(l => l.id === 'ontario_bpa');

    let fedTax = this.applyBrackets(gross, fedBrackets);
    // Federal BPA credit with clawback
    let fedBpaExempt = fedBpaData.exemptAmount;
    if (gross > fedBpaData.clawbackStart) {
      const reduction = (fedBpaExempt - fedBpaData.clawbackFloor) *
        Math.min(1, (gross - fedBpaData.clawbackStart) / (fedBpaData.clawbackEnd - fedBpaData.clawbackStart));
      fedBpaExempt = Math.max(fedBpaData.clawbackFloor, fedBpaExempt - reduction);
    }
    const fedCredit = fedBpaExempt * fedBpaData.creditRate;
    fedTax = Math.max(0, fedTax - fedCredit);

    let ontTax = this.applyBrackets(gross, ontBrackets);
    const ontCredit = ontBpaData.derivedCredit;
    ontTax = Math.max(0, ontTax - ontCredit);

    layers.push({ id: 'federal_income_tax', label: 'Federal Income Tax', amount: fedTax, color: '#3b82f6', side: 'employee', pass: 1 });
    layers.push({ id: 'ontario_income_tax', label: 'Ontario Provincial Income Tax', amount: ontTax, color: '#60a5fa', side: 'employee', pass: 1 });

    const totalDeductions = fedTax + ontTax;
    return { layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross };
  }

  calculateOntarioPass2(gross) {
    const layers = [];
    const cppData = this.data.layers.find(l => l.id === 'cpp');
    const cpp2Data = this.data.layers.find(l => l.id === 'cpp2');
    const eiData = this.data.layers.find(l => l.id === 'ei');
    const surtaxData = this.data.layers.find(l => l.id === 'ontario_surtax');
    const ohpData = this.data.layers.find(l => l.id === 'ontario_health_premium');

    // CPP
    const cpp = Math.min(cppData.maxContribution,
      Math.max(0, Math.min(gross, cppData.cap) - cppData.exemption) * cppData.rate);
    layers.push({ id: 'cpp', label: 'CPP', amount: cpp, color: '#a855f7', side: 'employee', pass: 2 });

    // CPP2
    const cpp2 = Math.min(cpp2Data.maxContribution,
      this.applyFlatBand(gross, cpp2Data.rate, cpp2Data.bandFrom, cpp2Data.bandTo));
    layers.push({ id: 'cpp2', label: 'CPP2', amount: cpp2, color: '#9333ea', side: 'employee', pass: 2 });

    // EI
    const ei = Math.min(eiData.maxContribution,
      this.applyFlatWithCap(gross, eiData.rate, eiData.cap));
    layers.push({ id: 'ei', label: 'Employment Insurance', amount: ei, color: '#c084fc', side: 'employee', pass: 2 });

    // Federal income tax (same as pass 1)
    const fedBrackets = this.data.layers.find(l => l.id === 'federal_income_tax').brackets;
    const fedBpaData = this.data.layers.find(l => l.id === 'federal_bpa');
    let fedTax = this.applyBrackets(gross, fedBrackets);
    let fedBpaExempt = fedBpaData.exemptAmount;
    if (gross > fedBpaData.clawbackStart) {
      const reduction = (fedBpaExempt - fedBpaData.clawbackFloor) *
        Math.min(1, (gross - fedBpaData.clawbackStart) / (fedBpaData.clawbackEnd - fedBpaData.clawbackStart));
      fedBpaExempt = Math.max(fedBpaData.clawbackFloor, fedBpaExempt - reduction);
    }
    const fedCredit = fedBpaExempt * fedBpaData.creditRate;
    fedTax = Math.max(0, fedTax - fedCredit);
    layers.push({ id: 'federal_income_tax', label: 'Federal Income Tax', amount: fedTax, color: '#3b82f6', side: 'employee', pass: 2 });

    // Ontario income tax + surtax
    const ontBrackets = this.data.layers.find(l => l.id === 'ontario_income_tax').brackets;
    const ontBpaData = this.data.layers.find(l => l.id === 'ontario_bpa');
    const ontTaxRaw = this.applyBrackets(gross, ontBrackets);
    // Surtax on raw provincial tax BEFORE credits
    const surtax = this.applySurtax(ontTaxRaw, surtaxData.tiers);
    const ontCredit = ontBpaData.derivedCredit;
    const ontTax = Math.max(0, ontTaxRaw - ontCredit);

    layers.push({ id: 'ontario_income_tax', label: 'Ontario Provincial Tax', amount: ontTax, color: '#60a5fa', side: 'employee', pass: 2 });
    layers.push({ id: 'ontario_surtax', label: 'Ontario Surtax', amount: surtax, color: '#f97316', side: 'employee', pass: 2, highlight: true });

    // Ontario Health Premium
    const ohp = this._calcOntarioHealthPremium(gross, ohpData);
    layers.push({ id: 'ontario_health_premium', label: 'Ontario Health Premium', amount: ohp, color: '#fb923c', side: 'employee', pass: 2 });

    const totalDeductions = layers.reduce((s, l) => s + l.amount, 0);
    return { layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross };
  }

  _calcOntarioHealthPremium(income, ohpData) {
    if (income <= 20000) return 0;
    if (income <= 36000) return Math.min(300, 0.06 * (income - 20000));
    if (income <= 48000) return 300 + Math.min(150, 0.06 * (income - 36000));
    if (income <= 72000) return 450 + Math.min(150, 0.25 * (income - 48000));
    if (income <= 200000) return 600 + Math.min(150, 0.25 * (income - 72000));
    return Math.min(ohpData.maxPremium, 750 + Math.min(150, 0.25 * (income - 200000)));
  }

  // ─── IRELAND ───────────────────────────────────────────────────────

  calculateIrelandPass1(gross) {
    const layers = [];
    const itBrackets = this.data.layers.find(l => l.id === 'income_tax').brackets;
    let incomeTax = this.applyBrackets(gross, itBrackets);
    const personalCredit = this.data.layers.find(l => l.id === 'personal_tax_credit').creditAmount;
    const employeeCredit = this.data.layers.find(l => l.id === 'employee_tax_credit').creditAmount;
    const totalCredits = personalCredit + employeeCredit;
    const incomeTaxAfterCredits = Math.max(0, incomeTax - totalCredits);

    layers.push({ id: 'income_tax', label: 'Income Tax (after credits)', amount: incomeTaxAfterCredits, color: '#3b82f6', side: 'employee', pass: 1,
      meta: { grossTax: incomeTax, credits: totalCredits }
    });

    const totalDeductions = incomeTaxAfterCredits;
    return { layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross };
  }

  calculateIrelandPass2(gross) {
    const layers = [];
    const itBrackets = this.data.layers.find(l => l.id === 'income_tax').brackets;
    const uscBrackets = this.data.layers.find(l => l.id === 'usc').brackets;
    const prsiData = this.data.layers.find(l => l.id === 'prsi');

    // Income tax — split by band for visualization
    const band20 = Math.min(gross, 44000) * 0.20;
    const band40 = Math.max(0, gross - 44000) * 0.40;
    const grossIncomeTax = band20 + band40;
    const personalCredit = 2000;
    const employeeCredit = 2000;
    const totalCredits = personalCredit + employeeCredit;

    layers.push({ id: 'income_tax_20', label: 'Income Tax @ 20%', amount: band20, color: '#3b82f6', side: 'employee', pass: 2,
      meta: { rate: 0.20, appliedTo: Math.min(gross, 44000) }
    });
    layers.push({ id: 'income_tax_40', label: 'Income Tax @ 40%', amount: band40, color: '#2563eb', side: 'employee', pass: 2,
      meta: { rate: 0.40, appliedTo: Math.max(0, gross - 44000) }
    });
    layers.push({ id: 'personal_tax_credit', label: 'Personal Tax Credit', amount: -personalCredit, color: '#22c55e', side: 'employee', pass: 2, isCredit: true });
    layers.push({ id: 'employee_tax_credit', label: 'Employee Tax Credit', amount: -employeeCredit, color: '#22c55e', side: 'employee', pass: 2, isCredit: true });

    // USC bands
    const uscAmounts = this._calcIrelandUSCBands(gross, uscBrackets);
    const uscColors = ['#fdba74', '#fb923c', '#f97316', '#ea580c'];
    const uscRates = [0.005, 0.02, 0.03, 0.08];
    const uscLabels = ['USC @ 0.5%', 'USC @ 2%', 'USC @ 3%', 'USC @ 8%'];
    uscAmounts.forEach((amt, i) => {
      if (amt > 0) {
        layers.push({ id: `usc_band_${i}`, label: uscLabels[i], amount: amt, color: uscColors[i], side: 'employee', pass: 2,
          highlight: i === 3, meta: { rate: uscRates[i] }
        });
      }
    });

    // PRSI
    const prsi = gross * prsiData.rate;
    layers.push({ id: 'prsi', label: 'PRSI @ 4.2%', amount: prsi, color: '#a855f7', side: 'employee', pass: 2,
      meta: { rate: prsiData.rate, appliedTo: gross }
    });

    const totalUSC = uscAmounts.reduce((s, a) => s + a, 0);
    const netIncomeTax = Math.max(0, grossIncomeTax - totalCredits);
    const totalDeductions = netIncomeTax + totalUSC + prsi;
    return {
      layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross,
      uscTotal: totalUSC, creditsTotal: totalCredits
    };
  }

  _calcIrelandUSCBands(gross, brackets) {
    if (gross < 13000) return [0, 0, 0, 0];
    const amounts = [];
    let prev = 0;
    for (const b of brackets) {
      const upper = b.upTo === null ? gross : Math.min(b.upTo, gross);
      const amt = Math.max(0, upper - prev) * b.rate;
      amounts.push(amt);
      prev = b.upTo === null ? gross : b.upTo;
      if (prev >= gross) break;
    }
    while (amounts.length < 4) amounts.push(0);
    return amounts;
  }

  // ─── SWEDEN ────────────────────────────────────────────────────────

  calculateSwedenEmployee(gross) {
    const layers = [];
    const munRate = this.data.defaultMunicipalRate;
    const PBB = this.data.priceBaseAmount;

    // Grundavdrag
    const grundavdrag = this._calcGrundavdrag(gross);
    const taxableIncome = Math.max(0, gross - grundavdrag);

    // Municipal tax
    const municipalTax = taxableIncome * munRate;
    layers.push({ id: 'municipal_tax', label: 'Municipal Tax @ 30.6%', amount: municipalTax, color: '#3b82f6', side: 'employee', pass: 1,
      meta: { rate: munRate, appliedTo: taxableIncome }
    });

    // State tax
    const stateThreshold = 625800;
    const stateTax = this.applyFlatAboveThreshold(gross, 0.20, stateThreshold);
    layers.push({ id: 'state_tax', label: 'State Tax @ 20%', amount: stateTax, color: '#2563eb', side: 'employee', pass: 1,
      meta: { rate: 0.20, threshold: stateThreshold }
    });

    // Pension fee
    const pensionData = this.data.layers.find(l => l.id === 'pension_fee');
    const pensionFee = Math.min(pensionData.maxAmount, gross * pensionData.rate);
    layers.push({ id: 'pension_fee', label: 'General Pension Fee @ 7%', amount: pensionFee, color: '#a855f7', side: 'employee', pass: 1 });

    // Public service fee
    const publicServiceFee = gross <= 129930 ? gross * 0.01 : 1249;
    layers.push({ id: 'public_service_fee', label: 'Public Service Fee', amount: publicServiceFee, color: '#c084fc', side: 'employee', pass: 1 });

    // Jobbskatteavdrag (employment tax credit) — applied against municipal tax
    const jsa = this._calcJobbskatteavdrag(gross, grundavdrag, munRate, PBB);
    layers.push({ id: 'jobbskatteavdrag', label: 'Employment Tax Credit', amount: -jsa, color: '#22c55e', side: 'employee', pass: 1, isCredit: true });

    const totalDeductions = municipalTax + stateTax + pensionFee + publicServiceFee - jsa;
    return { layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross };
  }

  calculateSwedenEmployer(gross) {
    const layers = [];
    const employerData = this.data.layers.find(l => l.id === 'arbetsgivaravgift');
    const total = gross * employerData.rate;
    layers.push({ id: 'arbetsgivaravgift', label: 'Employer Contributions @ 31.42%', amount: total, color: '#ef4444', side: 'employer', pass: 'employer_reveal',
      meta: { rate: employerData.rate, breakdown: employerData.breakdown }
    });
    return { layers, totalEmployer: total, trueCost: gross + total };
  }

  _calcGrundavdrag(income) {
    if (income <= 40096) return 0.423 * income;
    if (income <= 135240) return 16952 + 0.20 * (income - 40096);
    if (income <= 370440) return 35981;
    if (income <= 461040) return 35981 - 0.10 * (income - 370440);
    return Math.max(17234, 35981 - 0.10 * (income - 370440));
  }

  _calcJobbskatteavdrag(income, grundavdrag, munRate, PBB) {
    if (income >= 189540) {
      return 2.608 * PBB * munRate;
    }
    if (income >= 53508) {
      return (0.2832 * PBB + 0.3294 * (income - 0.91 * PBB)) * munRate;
    }
    return 0.3294 * (income - grundavdrag) * munRate;
  }

  // ─── ESTONIA ───────────────────────────────────────────────────────

  calculateEstoniaEmployee(gross) {
    const layers = [];
    const exemptionData = this.data.layers.find(l => l.id === 'basic_exemption');

    // Basic exemption with phaseout
    let exemption = 0;
    if (gross <= exemptionData.phaseoutStart) {
      exemption = exemptionData.fullAmount;
    } else if (gross >= exemptionData.phaseoutEnd) {
      exemption = 0;
    } else {
      exemption = exemptionData.fullAmount - exemptionData.fullAmount *
        ((gross - exemptionData.phaseoutStart) / (exemptionData.phaseoutEnd - exemptionData.phaseoutStart));
    }

    // Income tax (flat 22%)
    const taxableIncome = Math.max(0, gross - exemption);
    const incomeTax = taxableIncome * 0.22;
    layers.push({ id: 'income_tax', label: 'Income Tax (Flat 22%)', amount: incomeTax, color: '#3b82f6', side: 'employee', pass: 1,
      meta: { rate: 0.22, exemption, appliedTo: taxableIncome }
    });

    // Employee unemployment
    const empUnemploy = gross * 0.016;
    layers.push({ id: 'employee_unemployment', label: 'Employee Unemployment @ 1.6%', amount: empUnemploy, color: '#a855f7', side: 'employee', pass: 1 });

    // Pension II pillar
    const pensionII = gross * 0.02;
    layers.push({ id: 'employee_pension_ii', label: 'Funded Pension (II Pillar) @ 2%', amount: pensionII, color: '#c084fc', side: 'employee', pass: 1 });

    const totalDeductions = incomeTax + empUnemploy + pensionII;
    return { layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross };
  }

  calculateEstoniaEmployer(gross) {
    const layers = [];
    const socialTax = gross * 0.33;
    layers.push({ id: 'employer_social_tax', label: 'Employer Social Tax @ 33%', amount: socialTax, color: '#ef4444', side: 'employer', pass: 'employer_reveal',
      meta: { rate: 0.33, breakdown: this.data.layers.find(l => l.id === 'employer_social_tax').breakdown }
    });
    const empUnemploy = gross * 0.008;
    layers.push({ id: 'employer_unemployment', label: 'Employer Unemployment @ 0.8%', amount: empUnemploy, color: '#dc2626', side: 'employer', pass: 'employer_reveal' });
    const total = socialTax + empUnemploy;
    return { layers, totalEmployer: total, trueCost: gross + total };
  }

  // ─── HUNGARY ───────────────────────────────────────────────────────

  calculateHungaryPass1(gross) {
    const layers = [];
    const pit = gross * 0.15;
    layers.push({ id: 'income_tax', label: 'Personal Income Tax (Flat 15%)', amount: pit, color: '#3b82f6', side: 'employee', pass: 1,
      meta: { rate: 0.15 }
    });
    return { layers, totalDeductions: pit, netIncome: gross - pit, grossSalary: gross };
  }

  calculateHungaryPass2(gross) {
    const layers = [];
    const pit = gross * 0.15;
    layers.push({ id: 'income_tax', label: 'Personal Income Tax (15%)', amount: pit, color: '#3b82f6', side: 'employee', pass: 2 });

    const ssc = gross * 0.185;
    layers.push({ id: 'employee_ssc', label: 'Employee Social Security (18.5%)', amount: ssc, color: '#f97316', side: 'employee', pass: 2, highlight: true,
      meta: { rate: 0.185, breakdown: this.data.layers.find(l => l.id === 'employee_ssc').breakdown }
    });

    const totalDeductions = pit + ssc;
    return { layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross };
  }

  calculateHungaryEmployer(gross) {
    const layers = [];
    const employer = gross * 0.13;
    layers.push({ id: 'employer_social_contribution', label: 'Employer Social Contribution (13%)', amount: employer, color: '#ef4444', side: 'employer', pass: 'employer_reveal' });
    return { layers, totalEmployer: employer, trueCost: gross + employer };
  }

  // ─── FRANCE ────────────────────────────────────────────────────────

  calculateFrancePass1(gross) {
    const layers = [];
    const constants = this.data.constants;
    // Pass 1 base: gross - min(gross * 0.10, 14426)
    const profDeduction = Math.min(gross * constants.professionalExpenseRate, constants.professionalExpenseCap);
    const taxableIncome = Math.max(0, gross - profDeduction);

    const brackets = this.data.layers.find(l => l.id === 'income_tax').brackets;
    const incomeTax = this.applyBrackets(taxableIncome, brackets);

    layers.push({ id: 'income_tax', label: 'Income Tax (on simplified base)', amount: incomeTax, color: '#3b82f6', side: 'employee', pass: 1,
      meta: { taxableIncome, profDeduction }
    });

    return { layers, totalDeductions: incomeTax, netIncome: gross - incomeTax, grossSalary: gross, taxableIncome, incomeTax };
  }

  calculateFrancePass2(gross) {
    const layers = [];
    const constants = this.data.constants;
    const PASS = constants.PASS;

    // ── Employee SSC ──
    // Pension capped
    const pensionCapped = Math.min(gross, PASS) * 0.069;
    layers.push({ id: 'pension_capped', label: 'Pension (capped, up to PASS)', amount: pensionCapped, color: '#a855f7', side: 'employee', pass: 2,
      meta: { rate: 0.069, cap: PASS, deductible: true }
    });

    // Pension uncapped
    const pensionUncapped = gross * 0.004;
    layers.push({ id: 'pension_uncapped', label: 'Pension (uncapped)', amount: pensionUncapped, color: '#9333ea', side: 'employee', pass: 2,
      meta: { rate: 0.004, deductible: true }
    });

    // Unemployment
    const unemployment = Math.min(gross, constants.PASS_4x) * 0.024;
    layers.push({ id: 'unemployment', label: 'Unemployment Insurance', amount: unemployment, color: '#c084fc', side: 'employee', pass: 2,
      meta: { rate: 0.024, cap: constants.PASS_4x, deductible: true }
    });

    // AGIRC-ARRCO T1
    const agircT1 = this.applyFlatBand(gross, 0.0315, 0, PASS);
    layers.push({ id: 'agirc_t1', label: 'Supplementary Pension T1', amount: agircT1, color: '#7c3aed', side: 'employee', pass: 2,
      meta: { rate: 0.0315, band: `0–${PASS}`, deductible: true }
    });

    // AGIRC-ARRCO T2
    const agircT2 = this.applyFlatBand(gross, 0.0864, PASS, constants.PASS_8x);
    layers.push({ id: 'agirc_t2', label: 'Supplementary Pension T2', amount: agircT2, color: '#6d28d9', side: 'employee', pass: 2,
      meta: { rate: 0.0864, band: `${PASS}–${constants.PASS_8x}`, deductible: true }
    });

    // CEG T1
    const cegT1 = this.applyFlatBand(gross, 0.0086, 0, PASS);
    layers.push({ id: 'ceg_t1', label: 'CEG T1', amount: cegT1, color: '#8b5cf6', side: 'employee', pass: 2,
      meta: { rate: 0.0086, deductible: true }
    });

    // CEG T2
    const cegT2 = this.applyFlatBand(gross, 0.0108, PASS, constants.PASS_8x);
    layers.push({ id: 'ceg_t2', label: 'CEG T2', amount: cegT2, color: '#7c3aed', side: 'employee', pass: 2,
      meta: { rate: 0.0108, deductible: true }
    });

    // CSG/CRDS base: 98.25% of gross up to 4×PASS, 100% above
    const csgBase = Math.min(gross, constants.PASS_4x) * 0.9825 + Math.max(0, gross - constants.PASS_4x);

    // CSG deductible
    const csgDeductible = csgBase * 0.068;
    layers.push({ id: 'csg_deductible', label: 'CSG (deductible)', amount: csgDeductible, color: '#f97316', side: 'employee', pass: 2,
      meta: { rate: 0.068, base: csgBase, deductible: true }
    });

    // CSG non-deductible
    const csgNonDeductible = csgBase * 0.024;
    layers.push({ id: 'csg_nondeductible', label: 'CSG (non-deductible)', amount: csgNonDeductible, color: '#ea580c', side: 'employee', pass: 2,
      meta: { rate: 0.024, base: csgBase, deductible: false }, highlight: true
    });

    // CRDS
    const crds = csgBase * 0.005;
    layers.push({ id: 'crds', label: 'CRDS', amount: crds, color: '#c2410c', side: 'employee', pass: 2,
      meta: { rate: 0.005, base: csgBase, deductible: false }, highlight: true
    });

    // Deductible SSC for income tax base
    const deductibleSSC = pensionCapped + pensionUncapped + unemployment + agircT1 + agircT2 + cegT1 + cegT2 + csgDeductible;
    const afterDeductibleSSC = gross - deductibleSSC;
    const profDeduction = Math.min(afterDeductibleSSC * constants.professionalExpenseRate, constants.professionalExpenseCap);
    const taxableIncome = Math.max(0, afterDeductibleSSC - profDeduction);

    const brackets = this.data.layers.find(l => l.id === 'income_tax').brackets;
    const incomeTax = this.applyBrackets(taxableIncome, brackets);
    layers.push({ id: 'income_tax', label: 'Income Tax (on reduced base)', amount: incomeTax, color: '#3b82f6', side: 'employee', pass: 2,
      meta: { taxableIncome, deductibleSSC, profDeduction }
    });

    const totalSSC = pensionCapped + pensionUncapped + unemployment + agircT1 + agircT2 + cegT1 + cegT2 + csgDeductible + csgNonDeductible + crds;
    const totalDeductions = totalSSC + incomeTax;
    return {
      layers, totalDeductions, netIncome: gross - totalDeductions, grossSalary: gross,
      totalSSC, incomeTax, deductibleSSC, taxableIncome
    };
  }

  calculateFranceEmployer(gross) {
    const layers = [];
    const constants = this.data.constants;
    const PASS = constants.PASS;

    // Health insurance 13%
    const health = gross * 0.13;
    layers.push({ id: 'employer_health', label: 'Health Insurance (13%)', amount: health, color: '#ef4444', side: 'employer', pass: 'employer_reveal' });

    // Pension T1 8.55% up to PASS
    const pensionT1 = Math.min(gross, PASS) * 0.0855;
    layers.push({ id: 'employer_pension_t1', label: 'Pension T1 (8.55%)', amount: pensionT1, color: '#dc2626', side: 'employer', pass: 'employer_reveal' });

    // Pension overflow 2.02%
    const pensionOverflow = gross * 0.0202;
    layers.push({ id: 'employer_pension_overflow', label: 'Pension Overflow (2.02%)', amount: pensionOverflow, color: '#b91c1c', side: 'employer', pass: 'employer_reveal' });

    // Family allowances — tiered
    const familyRate = gross <= constants.SMIC_3_5x ? 0.0345 : 0.0525;
    const family = gross * familyRate;
    layers.push({ id: 'employer_family', label: `Family Allowances (${(familyRate * 100).toFixed(2)}%)`, amount: family, color: '#f87171', side: 'employer', pass: 'employer_reveal' });

    // Unemployment 4.05% up to 4×PASS
    const unemployment = Math.min(gross, constants.PASS_4x) * 0.0405;
    layers.push({ id: 'employer_unemployment', label: 'Unemployment (4.05%)', amount: unemployment, color: '#fca5a5', side: 'employer', pass: 'employer_reveal' });

    // AGIRC T1 4.72%
    const agircT1 = this.applyFlatBand(gross, 0.0472, 0, PASS);
    layers.push({ id: 'employer_agirc_t1', label: 'AGIRC-ARRCO T1 (4.72%)', amount: agircT1, color: '#fecaca', side: 'employer', pass: 'employer_reveal' });

    // AGIRC T2 12.95%
    const agircT2 = this.applyFlatBand(gross, 0.1295, PASS, constants.PASS_8x);
    layers.push({ id: 'employer_agirc_t2', label: 'AGIRC-ARRCO T2 (12.95%)', amount: agircT2, color: '#ef4444', side: 'employer', pass: 'employer_reveal' });

    // CEG T1 employer
    const cegT1 = this.applyFlatBand(gross, 0.0086, 0, PASS);
    layers.push({ id: 'employer_ceg_t1', label: 'CEG T1 (0.86%)', amount: cegT1, color: '#f87171', side: 'employer', pass: 'employer_reveal' });

    // CEG T2 employer
    const cegT2 = this.applyFlatBand(gross, 0.0108, PASS, constants.PASS_8x);
    layers.push({ id: 'employer_ceg_t2', label: 'CEG T2 (1.08%)', amount: cegT2, color: '#fca5a5', side: 'employer', pass: 'employer_reveal' });

    // Work accident
    const workAccident = gross * 0.0077;
    layers.push({ id: 'employer_work_accident', label: 'Work Accident (0.77%)', amount: workAccident, color: '#fecdd3', side: 'employer', pass: 'employer_reveal' });

    // AGS
    const ags = gross * 0.0025;
    layers.push({ id: 'employer_ags', label: 'Wage Guarantee (0.25%)', amount: ags, color: '#ffe4e6', side: 'employer', pass: 'employer_reveal' });

    const totalEmployer = layers.reduce((s, l) => s + l.amount, 0);
    return { layers, totalEmployer, trueCost: gross + totalEmployer };
  }

  // ─── Unified entry points ─────────────────────────────────────────

  calculatePass1(gross) {
    switch (this.id) {
      case 'ontario': return this.calculateOntarioPass1(gross);
      case 'ireland': return this.calculateIrelandPass1(gross);
      case 'hungary': return this.calculateHungaryPass1(gross);
      case 'france': return this.calculateFrancePass1(gross);
      case 'sweden': return this.calculateSwedenEmployee(gross);
      case 'estonia': return this.calculateEstoniaEmployee(gross);
      default: return { layers: [], totalDeductions: 0, netIncome: gross, grossSalary: gross };
    }
  }

  calculatePass2(gross) {
    switch (this.id) {
      case 'ontario': return this.calculateOntarioPass2(gross);
      case 'ireland': return this.calculateIrelandPass2(gross);
      case 'hungary': return this.calculateHungaryPass2(gross);
      case 'france': return this.calculateFrancePass2(gross);
      case 'sweden': return this.calculateSwedenEmployee(gross);
      case 'estonia': return this.calculateEstoniaEmployee(gross);
      default: return { layers: [], totalDeductions: 0, netIncome: gross, grossSalary: gross };
    }
  }

  calculateEmployerReveal(gross) {
    switch (this.id) {
      case 'sweden': return this.calculateSwedenEmployer(gross);
      case 'estonia': return this.calculateEstoniaEmployer(gross);
      case 'hungary': return this.calculateHungaryEmployer(gross);
      case 'france': return this.calculateFranceEmployer(gross);
      default: return { layers: [], totalEmployer: 0, trueCost: gross };
    }
  }
}
