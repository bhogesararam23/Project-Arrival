# Project Arrival — Pilot Readiness Dossier (Single-Route Target)

**Date:** 2026-11-27  
**Target Pilot Route:** United Kingdom (London, GB, Currency `GBP`) — Single Independent Merchant Location  
**Status:** Pre-Commercial / Pre-Sandbox (No live launch date committed)

---

## 1. Readiness Dimension Matrix

| Dimension | Owner / Entity | Technically Possible | Commercially Accessible | Legally Approved | Merchant Authorized | Sandbox Verified | Production Verified |
|---|---|---|---|---|---|---|---|
| **Market & Seller of Record** | Arrival UK Legal / Finance | Yes | Pending entity setup | **No** (Terms & seller-of-record model unapproved) | N/A | N/A | **No** |
| **Payment Processing (`GBP`)** | Provider TBD (e.g., Stripe Connect / Adyen) | Yes (`IPaymentAdapter`) | Pending KYB/KYC | **No** | Pending merchant onboarding | **No** (Mock only) | **No** |
| **Merchant POS Integration** | Provider TBD (Direct tablet / POS partner) | Yes (`IMerchantPosAdapter`) | Pending partner agreement | **No** | **No** | **No** (Mock only) | **No** |
| **Delivery / Fulfilment** | Merchant-managed or 3PL (e.g., Stuart / Uber Direct) | Yes (`IFulfilmentAdapter`) | Pending 3PL account | **No** | **No** | **No** (Mock only) | **No** |
| **Tax & VAT Handling** | Finance / Tax Counsel | Yes (20% VAT policy configured) | N/A | **No** (Requires tax counsel sign-off on marketplace VAT) | N/A | Unit tested | **No** |
| **Privacy, KMS & Consumer Disclosures** | Security / DPO | Partial (Redaction & retention service built; KMS pending) | N/A | **No** (Privacy notice & DPIA required) | N/A | Unit tested | **No** |

---

## 2. Hard Blockers Before Any Live Transaction
1. Executed commercial & legal agreements for Seller of Record, Payment Service Provider, and Fulfilment operator.
2. Signed Merchant Agreement authorizing Arrival to display menus and submit orders.
3. Envelope KMS encryption for `delivery_addresses` and OIDC/SSO operator authentication.
4. Sandbox end-to-end certification with the selected real payment, POS, and courier providers.
