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

  // ═══════════════════════════════════════════════════════════════════
  // Step generation for the waterfall stepper
  // Each step: { type, id, title, amount, direction, color, phase,
  //              explanation, technicalNote, runningNet }
  // ═══════════════════════════════════════════════════════════════════

  generateSteps(gross) {
    switch (this.id) {
      case 'ontario': return this._stepsOntario(gross);
      case 'ireland': return this._stepsIreland(gross);
      case 'sweden':  return this._stepsSweden(gross);
      case 'estonia': return this._stepsEstonia(gross);
      case 'hungary': return this._stepsHungary(gross);
      case 'france':  return this._stepsFrance(gross);
      default: return [];
    }
  }

  // ─── Ontario steps ──────────────────────────────────────────────

  _stepsOntario(gross) {
    const steps = [];
    let cursor = gross;

    const cppData = this.data.layers.find(l => l.id === 'cpp');
    const cpp2Data = this.data.layers.find(l => l.id === 'cpp2');
    const eiData = this.data.layers.find(l => l.id === 'ei');
    const surtaxData = this.data.layers.find(l => l.id === 'ontario_surtax');
    const ohpData = this.data.layers.find(l => l.id === 'ontario_health_premium');
    const fedBrackets = this.data.layers.find(l => l.id === 'federal_income_tax').brackets;
    const ontBrackets = this.data.layers.find(l => l.id === 'ontario_income_tax').brackets;
    const fedBpaData = this.data.layers.find(l => l.id === 'federal_bpa');
    const ontBpaData = this.data.layers.find(l => l.id === 'ontario_bpa');

    // Gross
    steps.push({
      type: 'gross', id: 'gross', title: 'Gross Salary', amount: gross,
      direction: 'right', color: '#22c55e', phase: 2,
      explanation: `Your annual gross salary of $${gross.toLocaleString()} — the number on your offer letter. Let's see what actually reaches your bank account.`,
      technicalNote: null, runningNet: gross
    });

    // CPP
    const cpp = Math.min(cppData.maxContribution,
      Math.max(0, Math.min(gross, cppData.cap) - cppData.exemption) * cppData.rate);
    cursor -= cpp;
    steps.push({
      type: 'employee', id: 'cpp', title: 'CPP (Canada Pension Plan)',
      amount: cpp, direction: 'left', color: '#a855f7', phase: 2,
      explanation: 'The Canada Pension Plan is a mandatory contribution toward your retirement pension. It applies to employment income between $3,500 and $71,300 at 5.95%.',
      technicalNote: `Capped at $${cppData.maxContribution.toLocaleString()}. Not in any income tax bracket table — it's a separate payroll deduction.`,
      runningNet: cursor
    });

    // CPP2
    const cpp2 = Math.min(cpp2Data.maxContribution,
      this.applyFlatBand(gross, cpp2Data.rate, cpp2Data.bandFrom, cpp2Data.bandTo));
    if (cpp2 > 0) {
      cursor -= cpp2;
      steps.push({
        type: 'employee', id: 'cpp2', title: 'CPP2 (Enhanced Pension)',
        amount: cpp2, direction: 'left', color: '#9333ea', phase: 2,
        explanation: 'New since 2024 — a second tier of CPP contributions on earnings between $71,300 and $81,200 at 4%.',
        technicalNote: `Maximum $${cpp2Data.maxContribution}. Introduced to boost retirement benefits, but adds another deduction layer most people didn't expect.`,
        runningNet: cursor
      });
    }

    // EI
    const ei = Math.min(eiData.maxContribution,
      this.applyFlatWithCap(gross, eiData.rate, eiData.cap));
    cursor -= ei;
    steps.push({
      type: 'employee', id: 'ei', title: 'Employment Insurance (EI)',
      amount: ei, direction: 'left', color: '#c084fc', phase: 2,
      explanation: 'Employment Insurance premiums fund jobless benefits. Every employee pays 1.64% of insurable earnings up to $65,700.',
      technicalNote: `Capped at $${eiData.maxContribution.toLocaleString()}. Another payroll deduction invisible in bracket tables.`,
      runningNet: cursor
    });

    // Federal Income Tax
    let fedTaxRaw = this.applyBrackets(gross, fedBrackets);
    cursor -= fedTaxRaw;
    steps.push({
      type: 'employee', id: 'fed_tax', title: 'Federal Income Tax',
      amount: fedTaxRaw, direction: 'left', color: '#3b82f6', phase: 2,
      explanation: 'Canada\'s federal income tax uses progressive brackets from 14.5% to 33%. This is the tax most people think of when they hear "tax rate."',
      technicalNote: 'Calculated on full gross income using 5 federal brackets. The Basic Personal Amount credit is applied in the next step.',
      runningNet: cursor
    });

    // Federal BPA Credit
    let fedBpaExempt = fedBpaData.exemptAmount;
    if (gross > fedBpaData.clawbackStart) {
      const reduction = (fedBpaExempt - fedBpaData.clawbackFloor) *
        Math.min(1, (gross - fedBpaData.clawbackStart) / (fedBpaData.clawbackEnd - fedBpaData.clawbackStart));
      fedBpaExempt = Math.max(fedBpaData.clawbackFloor, fedBpaExempt - reduction);
    }
    const fedCredit = fedBpaExempt * fedBpaData.creditRate;
    cursor += fedCredit;
    steps.push({
      type: 'employee', id: 'fed_bpa', title: 'Federal BPA Credit',
      amount: fedCredit, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `The Basic Personal Amount lets you earn $${Math.round(fedBpaExempt).toLocaleString()} tax-free at the lowest bracket rate, producing a credit of $${Math.round(fedCredit).toLocaleString()}.`,
      technicalNote: gross > fedBpaData.clawbackStart ? 'This credit is clawed back for high earners — it shrinks as income rises above $177,882.' : null,
      runningNet: cursor
    });

    // Ontario Provincial Tax
    const ontTaxRaw = this.applyBrackets(gross, ontBrackets);
    cursor -= ontTaxRaw;
    steps.push({
      type: 'employee', id: 'ont_tax', title: 'Ontario Provincial Tax',
      amount: ontTaxRaw, direction: 'left', color: '#60a5fa', phase: 2,
      explanation: 'Ontario\'s provincial income tax adds 5 more brackets on top of federal tax, from 5.05% to 13.16%. This is the second income tax most Ontarians know about.',
      technicalNote: 'Calculated on the same gross income as federal tax — Ontario does not deduct CPP/EI first.',
      runningNet: cursor
    });

    // Ontario Surtax
    const surtax = this.applySurtax(ontTaxRaw, surtaxData.tiers);
    if (surtax > 0) {
      cursor -= surtax;
      steps.push({
        type: 'employee', id: 'ont_surtax', title: 'Ontario Surtax',
        amount: surtax, direction: 'left', color: '#f97316', phase: 2,
        explanation: 'The Ontario Surtax is a tax on your tax. Once your Ontario tax exceeds $5,710, an extra 20% is levied on the excess. Above $7,307, another 36% stacks on top.',
        technicalNote: '<strong>This is the hidden layer.</strong> It appears in no bracket table. It\'s calculated on your provincial tax owing, not your income — a tax on a tax.',
        runningNet: cursor
      });
    }

    // Ontario BPA Credit
    const ontCredit = ontBpaData.derivedCredit;
    cursor += ontCredit;
    steps.push({
      type: 'employee', id: 'ont_bpa', title: 'Ontario BPA Credit',
      amount: ontCredit, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `Ontario's Basic Personal Amount provides a small credit of $${Math.round(ontCredit).toLocaleString()} — the first $12,747 of income is effectively tax-free at the lowest rate.`,
      technicalNote: null,
      runningNet: cursor
    });

    // Ontario Health Premium
    const ohp = this._calcOntarioHealthPremium(gross, ohpData);
    if (ohp > 0) {
      cursor -= ohp;
      steps.push({
        type: 'employee', id: 'ohp', title: 'Ontario Health Premium',
        amount: ohp, direction: 'left', color: '#fb923c', phase: 2,
        explanation: 'A progressive premium charged on your tax return to fund Ontario\'s health care system. Ranges from $0 (under $20K) to $900 (over $200K).',
        technicalNote: 'Not deductible, not a tax credit — just another line on your return that increases your total bill.',
        runningNet: cursor
      });
    }

    // Net
    steps.push({
      type: 'net', id: 'net', title: 'Net Take-Home',
      amount: cursor, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `After all deductions, you take home $${Math.round(cursor).toLocaleString()} of your $${gross.toLocaleString()} gross salary — an effective total rate of ${((1 - cursor / gross) * 100).toFixed(1)}%.`,
      technicalNote: null,
      runningNet: cursor
    });

    return steps;
  }

  // ─── Ireland steps ──────────────────────────────────────────────

  _stepsIreland(gross) {
    const steps = [];
    let cursor = gross;

    const itBrackets = this.data.layers.find(l => l.id === 'income_tax').brackets;
    const uscBrackets = this.data.layers.find(l => l.id === 'usc').brackets;
    const prsiData = this.data.layers.find(l => l.id === 'prsi');

    // Gross
    steps.push({
      type: 'gross', id: 'gross', title: 'Gross Salary', amount: gross,
      direction: 'right', color: '#22c55e', phase: 2,
      explanation: `Your annual gross salary of €${gross.toLocaleString()}. Ireland's income tax looks simple — 20% and 40%. Let's see the full picture.`,
      technicalNote: null, runningNet: gross
    });

    // Income Tax @ 20%
    const band20 = Math.min(gross, 44000) * 0.20;
    cursor -= band20;
    steps.push({
      type: 'employee', id: 'it_20', title: 'Income Tax @ 20%',
      amount: band20, direction: 'left', color: '#3b82f6', phase: 2,
      explanation: 'The standard rate band: the first €44,000 of your income is taxed at 20%. This is the rate most people associate with Irish tax.',
      technicalNote: 'Single person standard rate cut-off point for 2025.',
      runningNet: cursor
    });

    // Income Tax @ 40%
    const band40 = Math.max(0, gross - 44000) * 0.40;
    if (band40 > 0) {
      cursor -= band40;
      steps.push({
        type: 'employee', id: 'it_40', title: 'Income Tax @ 40%',
        amount: band40, direction: 'left', color: '#2563eb', phase: 2,
        explanation: 'Everything above €44,000 is taxed at 40% — the higher rate that gets all the headlines.',
        technicalNote: `Applied to €${Math.max(0, gross - 44000).toLocaleString()} of income.`,
        runningNet: cursor
      });
    }

    // Personal Tax Credit
    const personalCredit = 2000;
    cursor += personalCredit;
    steps.push({
      type: 'employee', id: 'personal_credit', title: 'Personal Tax Credit',
      amount: personalCredit, direction: 'right', color: '#22c55e', phase: 2,
      explanation: 'Every taxpayer gets a €2,000 credit that directly reduces income tax owing. Credits are subtracted after tax is calculated.',
      technicalNote: 'Crucially, this credit applies ONLY to income tax — not to USC or PRSI.',
      runningNet: cursor
    });

    // Employee Tax Credit
    const employeeCredit = 2000;
    cursor += employeeCredit;
    steps.push({
      type: 'employee', id: 'employee_credit', title: 'Employee (PAYE) Tax Credit',
      amount: employeeCredit, direction: 'right', color: '#22c55e', phase: 2,
      explanation: 'A second €2,000 credit for PAYE employees. Combined with the personal credit, that\'s €4,000 off your income tax.',
      technicalNote: 'Again, zero effect on USC or PRSI. This distinction is key to the deception.',
      runningNet: cursor
    });

    // USC bands
    const uscAmounts = this._calcIrelandUSCBands(gross, uscBrackets);
    const uscLabels = ['USC @ 0.5%', 'USC @ 2%', 'USC @ 3%', 'USC @ 8%'];
    const uscColors = ['#fdba74', '#fb923c', '#f97316', '#ea580c'];
    const uscExplanations = [
      'The Universal Social Charge starts at just 0.5% on the first €12,012. It looks like a minor charge.',
      'The second USC band applies 2% to income between €12,012 and €27,382.',
      'The third band at 3% covers income from €27,382 to €70,044.',
      'Above €70,044, USC jumps to 8%. At this rate, USC alone rivals many countries\' headline income tax rates.'
    ];
    for (let i = 0; i < uscAmounts.length; i++) {
      if (uscAmounts[i] > 0.5) {
        cursor -= uscAmounts[i];
        steps.push({
          type: 'employee', id: `usc_${i}`, title: uscLabels[i],
          amount: uscAmounts[i], direction: 'left', color: uscColors[i], phase: 2,
          explanation: uscExplanations[i],
          technicalNote: i === 3
            ? '<strong>This is the surprise.</strong> USC is a completely separate tax system. Your €4,000 in tax credits? They don\'t reduce USC by a single cent.'
            : 'USC is calculated on gross income with no credits, no deductions — a parallel tax system.',
          runningNet: cursor
        });
      }
    }

    // PRSI
    const prsi = gross * prsiData.rate;
    cursor -= prsi;
    steps.push({
      type: 'employee', id: 'prsi', title: 'PRSI @ 4.2%',
      amount: prsi, direction: 'left', color: '#a855f7', phase: 2,
      explanation: 'Pay Related Social Insurance funds state pensions, illness benefits, and more. It\'s 4.2% on all gross income — no cap, no ceiling.',
      technicalNote: 'A third separate tax on your payslip with its own rules, applied to the full gross amount.',
      runningNet: cursor
    });

    // Net
    steps.push({
      type: 'net', id: 'net', title: 'Net Take-Home',
      amount: cursor, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `After income tax, USC, and PRSI, you take home €${Math.round(cursor).toLocaleString()} — an effective rate of ${((1 - cursor / gross) * 100).toFixed(1)}%.`,
      technicalNote: null, runningNet: cursor
    });

    return steps;
  }

  // ─── Sweden steps ───────────────────────────────────────────────

  _stepsSweden(gross) {
    const steps = [];
    let cursor = gross;
    const munRate = this.data.defaultMunicipalRate;
    const PBB = this.data.priceBaseAmount;
    const employerData = this.data.layers.find(l => l.id === 'arbetsgivaravgift');
    const employerTotal = gross * employerData.rate;

    // Gross
    steps.push({
      type: 'gross', id: 'gross', title: 'Gross Salary', amount: gross,
      direction: 'right', color: '#22c55e', phase: 2,
      explanation: `Your gross annual salary of SEK ${gross.toLocaleString()}. Sweden is known for high taxes — but there's more to the story than income tax.`,
      technicalNote: null, runningNet: gross
    });

    // Phase 1: Employer
    steps.push({
      type: 'employer', id: 'arbetsgivaravgift', title: 'Employer Contributions (31.42%)',
      amount: employerTotal, direction: 'left', color: '#ef4444', phase: 1,
      explanation: 'Your employer pays 31.42% of your gross salary in social contributions — on every single krona, with no ceiling. This money was budgeted for your position but never appears on your payslip.',
      technicalNote: `SEK ${Math.round(employerTotal).toLocaleString()} paid to: old-age pension, sickness insurance, parental insurance, labour market fees, and more. <strong>No cap — it scales linearly with salary.</strong>`,
      runningNet: gross
    });

    // Phase 2: Employee
    // Municipal tax
    const grundavdrag = this._calcGrundavdrag(gross);
    const taxableIncome = Math.max(0, gross - grundavdrag);
    const municipalTax = taxableIncome * munRate;
    cursor -= municipalTax;
    steps.push({
      type: 'employee', id: 'municipal_tax', title: 'Municipal Tax (30.6%)',
      amount: municipalTax, direction: 'left', color: '#3b82f6', phase: 2,
      explanation: `Sweden's largest tax for most earners. Kommunalskatt is levied at ~30.6% on taxable income (gross minus grundavdrag of SEK ${Math.round(grundavdrag).toLocaleString()}).`,
      technicalNote: 'This funds local services, schools, healthcare, and social services. The rate varies by municipality — 30.6% is the average.',
      runningNet: cursor
    });

    // State tax
    const stateTax = this.applyFlatAboveThreshold(gross, 0.20, 625800);
    if (stateTax > 0) {
      cursor -= stateTax;
      steps.push({
        type: 'employee', id: 'state_tax', title: 'State Tax (20%)',
        amount: stateTax, direction: 'left', color: '#2563eb', phase: 2,
        explanation: 'Earners above SEK 625,800 pay an additional 20% state income tax on the excess. Combined with municipal tax, the marginal rate exceeds 50%.',
        technicalNote: `Applied to SEK ${Math.round(gross - 625800).toLocaleString()} above the threshold.`,
        runningNet: cursor
      });
    }

    // Pension fee
    const pensionData = this.data.layers.find(l => l.id === 'pension_fee');
    const pensionFee = Math.min(pensionData.maxAmount, gross * pensionData.rate);
    cursor -= pensionFee;
    steps.push({
      type: 'employee', id: 'pension_fee', title: 'General Pension Fee (7%)',
      amount: pensionFee, direction: 'left', color: '#a855f7', phase: 2,
      explanation: 'A 7% fee that funds the public pension system. Capped at SEK 45,500 per year.',
      technicalNote: 'Separate from the employer\'s pension contribution — you\'re both paying into the same system from different pockets.',
      runningNet: cursor
    });

    // Public service fee
    const publicServiceFee = gross <= 129930 ? gross * 0.01 : 1249;
    cursor -= publicServiceFee;
    steps.push({
      type: 'employee', id: 'public_service_fee', title: 'Public Service Fee',
      amount: publicServiceFee, direction: 'left', color: '#c084fc', phase: 2,
      explanation: 'A small flat fee for public broadcasting and similar services. 1% of income up to a max of SEK 1,249.',
      technicalNote: null,
      runningNet: cursor
    });

    // Jobbskatteavdrag (credit)
    const jsa = this._calcJobbskatteavdrag(gross, grundavdrag, munRate, PBB);
    cursor += jsa;
    steps.push({
      type: 'employee', id: 'jobbskatteavdrag', title: 'Employment Tax Credit',
      amount: jsa, direction: 'right', color: '#22c55e', phase: 2,
      explanation: 'The jobbskatteavdrag is Sweden\'s substantial employment tax credit — designed to make working more attractive than living on benefits. It directly reduces tax owed.',
      technicalNote: `Worth SEK ${Math.round(jsa).toLocaleString()} for your income level. This credit is why Sweden's effective employee rate is lower than the headline numbers suggest.`,
      runningNet: cursor
    });

    // Net
    steps.push({
      type: 'net', id: 'net', title: 'Net Take-Home',
      amount: cursor, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `You take home SEK ${Math.round(cursor).toLocaleString()}, but your employer spent SEK ${Math.round(gross + employerTotal).toLocaleString()} total. The government collected SEK ${Math.round(gross + employerTotal - cursor).toLocaleString()} from both sides combined.`,
      technicalNote: null, runningNet: cursor
    });

    return steps;
  }

  // ─── Estonia steps ──────────────────────────────────────────────

  _stepsEstonia(gross) {
    const steps = [];
    let cursor = gross;
    const exemptionData = this.data.layers.find(l => l.id === 'basic_exemption');

    let exemption = 0;
    if (gross <= exemptionData.phaseoutStart) exemption = exemptionData.fullAmount;
    else if (gross >= exemptionData.phaseoutEnd) exemption = 0;
    else exemption = exemptionData.fullAmount - exemptionData.fullAmount *
      ((gross - exemptionData.phaseoutStart) / (exemptionData.phaseoutEnd - exemptionData.phaseoutStart));

    const socialTax = gross * 0.33;
    const empUnemploy = gross * 0.008;
    const totalEmployer = socialTax + empUnemploy;

    // Gross
    steps.push({
      type: 'gross', id: 'gross', title: 'Gross Salary', amount: gross,
      direction: 'right', color: '#22c55e', phase: 2,
      explanation: `Your annual gross salary of €${gross.toLocaleString()}. Estonia is famous for its "simple flat 22% tax." Let's verify that claim.`,
      technicalNote: null, runningNet: gross
    });

    // Phase 1: Employer
    steps.push({
      type: 'employer', id: 'employer_social', title: 'Employer Social Tax (33%)',
      amount: socialTax, direction: 'left', color: '#ef4444', phase: 1,
      explanation: 'Estonian employers pay 33% of gross salary in social tax — 20% for pension insurance, 13% for health insurance. No cap.',
      technicalNote: '<strong>This is the hidden cost.</strong> Estonia markets itself as a flat-tax haven, but employers pay 33% on every euro before the employee sees anything.',
      runningNet: gross
    });

    steps.push({
      type: 'employer', id: 'employer_unemployment', title: 'Employer Unemployment (0.8%)',
      amount: empUnemploy, direction: 'left', color: '#dc2626', phase: 1,
      explanation: 'An additional 0.8% unemployment insurance contribution paid by the employer. Small but adds to the total.',
      technicalNote: null,
      runningNet: gross
    });

    // Phase 2: Employee
    const taxableIncome = Math.max(0, gross - exemption);
    const incomeTax = taxableIncome * 0.22;
    cursor -= incomeTax;
    steps.push({
      type: 'employee', id: 'income_tax', title: 'Income Tax (Flat 22%)',
      amount: incomeTax, direction: 'left', color: '#3b82f6', phase: 2,
      explanation: `Estonia's headline tax: a flat 22% on taxable income. ${exemption > 0 ? `Your basic exemption of €${Math.round(exemption).toLocaleString()} reduces the taxable base.` : 'At your income level, the basic exemption is fully phased out — you pay 22% on every euro.'}`,
      technicalNote: exemption === 0 ? 'The €7,848 basic exemption disappears entirely above €25,200 — most working professionals get zero benefit.' : null,
      runningNet: cursor
    });

    const eeUnemploy = gross * 0.016;
    cursor -= eeUnemploy;
    steps.push({
      type: 'employee', id: 'ee_unemployment', title: 'Employee Unemployment (1.6%)',
      amount: eeUnemploy, direction: 'left', color: '#a855f7', phase: 2,
      explanation: 'Employee-side unemployment insurance at 1.6% of gross. Small but mandatory — not in the "flat 22%" headline.',
      technicalNote: null,
      runningNet: cursor
    });

    const pensionII = gross * 0.02;
    cursor -= pensionII;
    steps.push({
      type: 'employee', id: 'pension_ii', title: 'Funded Pension II Pillar (2%)',
      amount: pensionII, direction: 'left', color: '#c084fc', phase: 2,
      explanation: 'A 2% contribution to Estonia\'s funded pension system. Technically voluntary since 2021, but most employees participate.',
      technicalNote: 'Combined employee burden: 22% + 1.6% + 2% = 25.6% — not 22%.',
      runningNet: cursor
    });

    // Net
    steps.push({
      type: 'net', id: 'net', title: 'Net Take-Home',
      amount: cursor, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `You keep €${Math.round(cursor).toLocaleString()}, but your employer spent €${Math.round(gross + totalEmployer).toLocaleString()} total. Estonia's "simple 22%" actually costs 33.8% extra on top.`,
      technicalNote: null, runningNet: cursor
    });

    return steps;
  }

  // ─── Hungary steps ──────────────────────────────────────────────

  _stepsHungary(gross) {
    const steps = [];
    let cursor = gross;
    const employerRate = 0.13;
    const employerTotal = gross * employerRate;

    // Gross
    steps.push({
      type: 'gross', id: 'gross', title: 'Gross Salary', amount: gross,
      direction: 'right', color: '#22c55e', phase: 2,
      explanation: `Your gross annual salary of HUF ${gross.toLocaleString()}. Hungary boasts a "15% flat tax" — one of Europe's lowest headline rates. Let's see the reality.`,
      technicalNote: null, runningNet: gross
    });

    // Phase 1: Employer
    steps.push({
      type: 'employer', id: 'employer_szocho', title: 'Employer SZOCHO (13%)',
      amount: employerTotal, direction: 'left', color: '#ef4444', phase: 1,
      explanation: 'Hungarian employers pay a 13% social contribution tax (SZOCHO) on gross salary. This funds pensions, healthcare, and the labour market.',
      technicalNote: 'Effectively uncapped for practical salary ranges. The "15% flat tax" headline ignores this entirely.',
      runningNet: gross
    });

    // Phase 2: Employee
    const pit = gross * 0.15;
    cursor -= pit;
    steps.push({
      type: 'employee', id: 'pit', title: 'Personal Income Tax (15%)',
      amount: pit, direction: 'left', color: '#3b82f6', phase: 2,
      explanation: 'The famous flat 15% PIT — simple, clean, and real. No brackets, no deductions for most workers.',
      technicalNote: 'This is the rate politicians cite. It\'s accurate as far as it goes.',
      runningNet: cursor
    });

    const ssc = gross * 0.185;
    cursor -= ssc;
    steps.push({
      type: 'employee', id: 'employee_ssc', title: 'Employee Social Security (18.5%)',
      amount: ssc, direction: 'left', color: '#f97316', phase: 2,
      explanation: 'A mandatory 18.5% social security contribution — pension (10%), healthcare (4%), unemployment (3%), and work accident (1.5%). Applied to gross salary, non-deductible.',
      technicalNote: '<strong>This is the surprise.</strong> At 18.5%, this single contribution is larger than the headline income tax. Combined employee burden: 33.5% — more than double the advertised 15%.',
      runningNet: cursor
    });

    // Net
    steps.push({
      type: 'net', id: 'net', title: 'Net Take-Home',
      amount: cursor, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `You keep HUF ${Math.round(cursor).toLocaleString()} — just 66.5% of gross. Your employer spent HUF ${Math.round(gross + employerTotal).toLocaleString()} total. The "15% flat tax" country actually takes 33.5% from the employee and 13% from the employer.`,
      technicalNote: null, runningNet: cursor
    });

    return steps;
  }

  // ─── France steps ───────────────────────────────────────────────

  _stepsFrance(gross) {
    const steps = [];
    let cursor = gross;
    const constants = this.data.constants;
    const PASS = constants.PASS;

    // Calculate employer amounts first (for chart scale)
    const empHealth = gross * 0.13;
    const empPensionT1 = Math.min(gross, PASS) * 0.0855;
    const empPensionOF = gross * 0.0202;
    const familyRate = gross <= constants.SMIC_3_5x ? 0.0345 : 0.0525;
    const empFamily = gross * familyRate;
    const empUnemploy = Math.min(gross, constants.PASS_4x) * 0.0405;
    const empAgircT1 = this.applyFlatBand(gross, 0.0472, 0, PASS);
    const empAgircT2 = this.applyFlatBand(gross, 0.1295, PASS, constants.PASS_8x);
    const empCeg = this.applyFlatBand(gross, 0.0086, 0, PASS) + this.applyFlatBand(gross, 0.0108, PASS, constants.PASS_8x);
    const empOther = gross * 0.0077 + gross * 0.0025;

    // Gross
    steps.push({
      type: 'gross', id: 'gross', title: 'Gross Salary', amount: gross,
      direction: 'right', color: '#22c55e', phase: 2,
      explanation: `Your gross annual salary of €${gross.toLocaleString()}. France's income tax brackets look moderate — 0%, 11%, 30%, 41%, 45%. The reality is far more complex.`,
      technicalNote: null, runningNet: gross
    });

    // Phase 1: Employer contributions
    steps.push({
      type: 'employer', id: 'emp_health', title: 'Health Insurance (13%)',
      amount: empHealth, direction: 'left', color: '#ef4444', phase: 1,
      explanation: 'France\'s largest single employer contribution: 13% of gross salary for health insurance (Assurance Maladie). No cap — applies to every euro.',
      technicalNote: 'Reduced to ~7% only for wages very close to the minimum wage.',
      runningNet: gross
    });

    steps.push({
      type: 'employer', id: 'emp_pension_t1', title: 'Pension T1 (8.55%)',
      amount: empPensionT1, direction: 'left', color: '#dc2626', phase: 1,
      explanation: `Employer pension contribution at 8.55% on salary up to the PASS ceiling (€${PASS.toLocaleString()}).`,
      technicalNote: null, runningNet: gross
    });

    steps.push({
      type: 'employer', id: 'emp_pension_of', title: 'Pension Overflow (2.02%)',
      amount: empPensionOF, direction: 'left', color: '#b91c1c', phase: 1,
      explanation: 'An additional 2.02% pension contribution on ALL salary — no cap. Pension contributions never fully stop in France.',
      technicalNote: null, runningNet: gross
    });

    steps.push({
      type: 'employer', id: 'emp_family', title: `Family Allowances (${(familyRate * 100).toFixed(2)}%)`,
      amount: empFamily, direction: 'left', color: '#f87171', phase: 1,
      explanation: `Family allowance contributions at ${(familyRate * 100).toFixed(2)}%. ${gross > constants.SMIC_3_5x ? 'Your salary exceeds 3.5× SMIC, so the higher 5.25% rate applies to your entire salary — a cliff effect.' : 'The reduced 3.45% rate applies since your salary is below 3.5× SMIC.'}`,
      technicalNote: null, runningNet: gross
    });

    steps.push({
      type: 'employer', id: 'emp_unemployment', title: 'Unemployment (4.05%)',
      amount: empUnemploy, direction: 'left', color: '#fca5a5', phase: 1,
      explanation: 'Employer unemployment insurance at 4.05% on salary up to 4× PASS. Effectively uncapped for most workers.',
      technicalNote: null, runningNet: gross
    });

    if (empAgircT1 > 0) {
      steps.push({
        type: 'employer', id: 'emp_agirc_t1', title: 'AGIRC-ARRCO T1 (4.72%)',
        amount: empAgircT1, direction: 'left', color: '#ef4444', phase: 1,
        explanation: 'Supplementary pension (AGIRC-ARRCO) employer portion: 4.72% on salary up to PASS.',
        technicalNote: null, runningNet: gross
      });
    }

    if (empAgircT2 > 0) {
      steps.push({
        type: 'employer', id: 'emp_agirc_t2', title: 'AGIRC-ARRCO T2 (12.95%)',
        amount: empAgircT2, direction: 'left', color: '#dc2626', phase: 1,
        explanation: 'Supplementary pension T2: 12.95% on salary between PASS and 8× PASS. The single highest employer contribution rate.',
        technicalNote: null, runningNet: gross
      });
    }

    if (empCeg > 1) {
      steps.push({
        type: 'employer', id: 'emp_ceg', title: 'CEG (Equilibrium Contribution)',
        amount: empCeg, direction: 'left', color: '#f87171', phase: 1,
        explanation: 'General Equilibrium Contribution to shore up the supplementary pension system. Split into two tiers.',
        technicalNote: null, runningNet: gross
      });
    }

    if (empOther > 1) {
      steps.push({
        type: 'employer', id: 'emp_other', title: 'Work Accident + Wage Guarantee',
        amount: empOther, direction: 'left', color: '#fecaca', phase: 1,
        explanation: 'Work accident insurance (~0.77%) and the wage guarantee fund (0.25%). Small individually, they add up across all the layers.',
        technicalNote: null, runningNet: gross
      });
    }

    // Phase 2: Employee
    // Pension capped
    const pensionCapped = Math.min(gross, PASS) * 0.069;
    cursor -= pensionCapped;
    steps.push({
      type: 'employee', id: 'pension_capped', title: 'Old-Age Pension (6.9%)',
      amount: pensionCapped, direction: 'left', color: '#a855f7', phase: 2,
      explanation: `Employee pension contribution at 6.9% on salary up to PASS (€${PASS.toLocaleString()}). This is deductible from your income tax base.`,
      technicalNote: 'Deductible — reduces your taxable income for income tax calculation.',
      runningNet: cursor
    });

    // Pension uncapped
    const pensionUncapped = gross * 0.004;
    cursor -= pensionUncapped;
    steps.push({
      type: 'employee', id: 'pension_uncapped', title: 'Pension Uncapped (0.4%)',
      amount: pensionUncapped, direction: 'left', color: '#9333ea', phase: 2,
      explanation: '0.4% on all salary with no ceiling. Small but adds to the deductible SSC total.',
      technicalNote: null, runningNet: cursor
    });

    // Unemployment
    const unemployment = Math.min(gross, constants.PASS_4x) * 0.024;
    cursor -= unemployment;
    steps.push({
      type: 'employee', id: 'unemployment', title: 'Unemployment Insurance (2.4%)',
      amount: unemployment, direction: 'left', color: '#c084fc', phase: 2,
      explanation: 'Employee unemployment insurance at 2.4% on salary up to 4× PASS. Deductible from income tax base.',
      technicalNote: null, runningNet: cursor
    });

    // AGIRC T1+T2 combined for brevity
    const agircT1 = this.applyFlatBand(gross, 0.0315, 0, PASS);
    const agircT2 = this.applyFlatBand(gross, 0.0864, PASS, constants.PASS_8x);
    const agircTotal = agircT1 + agircT2;
    cursor -= agircTotal;
    steps.push({
      type: 'employee', id: 'agirc', title: 'Supplementary Pension (AGIRC-ARRCO)',
      amount: agircTotal, direction: 'left', color: '#7c3aed', phase: 2,
      explanation: `Supplementary pension contributions: 3.15% on salary up to PASS, plus 8.64% on salary between PASS and 8× PASS. Total: €${Math.round(agircTotal).toLocaleString()}.`,
      technicalNote: 'Deductible from income tax base. One of many "hidden" pension layers.',
      runningNet: cursor
    });

    // CEG combined
    const cegT1 = this.applyFlatBand(gross, 0.0086, 0, PASS);
    const cegT2 = this.applyFlatBand(gross, 0.0108, PASS, constants.PASS_8x);
    const cegTotal = cegT1 + cegT2;
    if (cegTotal > 1) {
      cursor -= cegTotal;
      steps.push({
        type: 'employee', id: 'ceg', title: 'CEG (Equilibrium)',
        amount: cegTotal, direction: 'left', color: '#8b5cf6', phase: 2,
        explanation: 'General Equilibrium Contribution — employee side. Deductible.',
        technicalNote: null, runningNet: cursor
      });
    }

    // CSG deductible
    const csgBase = Math.min(gross, constants.PASS_4x) * 0.9825 + Math.max(0, gross - constants.PASS_4x);
    const csgDeductible = csgBase * 0.068;
    cursor -= csgDeductible;
    steps.push({
      type: 'employee', id: 'csg_deductible', title: 'CSG — Deductible (6.8%)',
      amount: csgDeductible, direction: 'left', color: '#f97316', phase: 2,
      explanation: 'The Contribution Sociale Généralisée — France\'s broad social levy. The deductible portion at 6.8% reduces your income tax base.',
      technicalNote: 'Applied to 98.25% of gross salary (up to 4× PASS). The CSG is the key mechanism that masks France\'s true tax burden.',
      runningNet: cursor
    });

    // CSG non-deductible
    const csgNonDed = csgBase * 0.024;
    cursor -= csgNonDed;
    steps.push({
      type: 'employee', id: 'csg_nondeductible', title: 'CSG — Non-Deductible (2.4%)',
      amount: csgNonDed, direction: 'left', color: '#eab308', phase: 2,
      explanation: 'The non-deductible portion of CSG: you pay it AND it stays in your taxable income. Double taxation in all but name.',
      technicalNote: '<strong>This is a hidden layer.</strong> Unlike the deductible CSG, this 2.4% gives no income tax relief — you\'re taxed on money already taken.',
      runningNet: cursor
    });

    // CRDS
    const crds = csgBase * 0.005;
    cursor -= crds;
    steps.push({
      type: 'employee', id: 'crds', title: 'CRDS — Social Debt (0.5%)',
      amount: crds, direction: 'left', color: '#eab308', phase: 2,
      explanation: 'The Contribution pour le Remboursement de la Dette Sociale — a tax created in 1996 to repay social security debt. Still being collected 30 years later.',
      technicalNote: 'Non-deductible. Like the non-deductible CSG, it increases your effective tax base.',
      runningNet: cursor
    });

    // Income Tax (on reduced base)
    const deductibleSSC = pensionCapped + pensionUncapped + unemployment + agircTotal + cegTotal + csgDeductible;
    const afterDeductibleSSC = gross - deductibleSSC;
    const profDeduction = Math.min(afterDeductibleSSC * constants.professionalExpenseRate, constants.professionalExpenseCap);
    const taxableIncome = Math.max(0, afterDeductibleSSC - profDeduction);
    const brackets = this.data.layers.find(l => l.id === 'income_tax').brackets;
    const incomeTax = this.applyBrackets(taxableIncome, brackets);
    cursor -= incomeTax;
    steps.push({
      type: 'employee', id: 'income_tax', title: 'Income Tax',
      amount: incomeTax, direction: 'left', color: '#3b82f6', phase: 2,
      explanation: `Income tax is calculated LAST, on a reduced base of €${Math.round(taxableIncome).toLocaleString()} (after deducting SSC and a 10% professional expenses allowance from your €${gross.toLocaleString()} gross).`,
      technicalNote: 'The deductible SSC reduces your income tax — which is why France\'s income tax looks moderate. The burden is hidden in the social contributions above.',
      runningNet: cursor
    });

    // Net
    const totalEmployer = empHealth + empPensionT1 + empPensionOF + empFamily + empUnemploy + empAgircT1 + empAgircT2 + empCeg + empOther;
    steps.push({
      type: 'net', id: 'net', title: 'Net Take-Home',
      amount: cursor, direction: 'right', color: '#22c55e', phase: 2,
      explanation: `You take home €${Math.round(cursor).toLocaleString()}. Your employer spent €${Math.round(gross + totalEmployer).toLocaleString()} total. The government collected €${Math.round(gross + totalEmployer - cursor).toLocaleString()} — on a €${gross.toLocaleString()} salary.`,
      technicalNote: null, runningNet: cursor
    });

    return steps;
  }
}
