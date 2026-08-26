import { beforeAll, describe, expect, it } from "vitest";
import {
  createPortalCredentials,
  DEFAULT_PORTAL_FILE_SIZE,
  createReceiptCode,
  decryptPortalToken,
  encryptPortalToken,
  generatePortalToken,
  hashPortalToken,
  normalizeCarnet,
  portalAcceptsPublicSession,
  portalState,
  publicMemberReference,
  rateLimitDelay,
  verifyCarnet,
} from "./submission-portal";
import {
  signPublicSubmissionToken,
  verifyPublicSubmissionToken,
} from "./public-submission-token";

beforeAll(() => {
  process.env.AUTH_SECRET ||= "test-secret-with-at-least-thirty-two-characters";
});

describe("seguridad del portal público", () => {
  it("usa 50 MB como tamaño predeterminado para un portal nuevo", () => {
    expect(DEFAULT_PORTAL_FILE_SIZE).toBe(50 * 1024 * 1024);
  });
  it("genera tokens criptográficos largos, únicos y validables por hash", () => {
    const first = generatePortalToken();
    const second = generatePortalToken();
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(first).not.toBe(second);
    expect(hashPortalToken(first)).toHaveLength(64);
    expect(hashPortalToken(first)).not.toBe(hashPortalToken(second));
  });

  it("cifra el token para recuperarlo solo en el panel autenticado", () => {
    const token = generatePortalToken();
    const encrypted = encryptPortalToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptPortalToken(encrypted)).toBe(token);
  });

  it("construye credenciales completas para create aunque el upsert termine actualizando", () => {
    const credentials = createPortalCredentials();
    expect(credentials.token).toBeTruthy();
    expect(credentials.tokenHash).toBe(hashPortalToken(credentials.token));
    expect(decryptPortalToken(credentials.tokenCipher)).toBe(credentials.token);
  });

  it("crea referencias públicas sin exponer IDs internos", () => {
    const reference = publicMemberReference(
      "portal-interno",
      "miembro-interno",
    );
    expect(reference).not.toContain("miembro");
    expect(reference).toHaveLength(32);
  });

  it("normaliza y compara el carné sin modificar el almacenado", () => {
    expect(normalizeCarnet(" 2026- 01-1001 ")).toBe("2026011001");
    expect(verifyCarnet("2026 01 1001", "2026-01-1001")).toBe(true);
    expect(verifyCarnet("2026-01-1002", "2026-01-1001")).toBe(false);
  });

  it.each([
    [
      {
        enabled: false,
        dueAt: "2026-08-10T18:00:00Z",
        allowLateSubmissions: false,
      },
      "DISABLED",
    ],
    [
      {
        enabled: true,
        opensAt: "2026-08-11T00:00:00Z",
        dueAt: "2026-08-12T00:00:00Z",
        allowLateSubmissions: false,
      },
      "UPCOMING",
    ],
    [
      {
        enabled: true,
        closesAt: "2026-08-09T00:00:00Z",
        dueAt: "2026-08-09T00:00:00Z",
        allowLateSubmissions: false,
      },
      "CLOSED",
    ],
    [
      {
        enabled: true,
        closesAt: "2026-08-09T00:00:00Z",
        dueAt: "2026-08-09T00:00:00Z",
        allowLateSubmissions: true,
      },
      "LATE_ALLOWED",
    ],
    [
      {
        enabled: true,
        dueAt: "2026-08-10T13:00:00Z",
        allowLateSubmissions: false,
      },
      "DUE_SOON",
    ],
    [
      {
        enabled: true,
        dueAt: "2026-08-12T13:00:00Z",
        allowLateSubmissions: false,
      },
      "OPEN",
    ],
  ] as const)("calcula el estado visible del portal", (input, expected) => {
    expect(portalState(input, new Date("2026-08-10T12:00:00Z"))).toBe(expected);
  });

  it.each(["FINALIZED", "CONSOLIDATED", "ARCHIVED"])(
    "cierra el portal cuando la tarea está %s",
    (assignmentStatus) => {
      expect(portalState({
        enabled: true,
        dueAt: "2026-08-12T13:00:00Z",
        allowLateSubmissions: true,
        assignmentStatus,
      }, new Date("2026-08-10T12:00:00Z"))).toBe("CLOSED");
    },
  );

  it("aplica esperas progresivas después de intentos fallidos", () => {
    expect(rateLimitDelay(4)).toBe(0);
    expect(rateLimitDelay(5)).toBe(5 * 60 * 1000);
    expect(rateLimitDelay(7)).toBe(15 * 60 * 1000);
    expect(rateLimitDelay(10)).toBe(60 * 60 * 1000);
  });

  it("genera un comprobante descriptivo sin conceder acceso", () => {
    expect(createReceiptCode("CAL2", 4, "Carlos Eduardo Díaz García")).toMatch(
      /^CAL2-T4-CEDG-[A-F0-9]{6}$/,
    );
  });

  it("mantiene válida la sesión cuando la exclusión pertenece a otro integrante", () => {
    expect(
      portalAcceptsPublicSession({
        enabled: true,
        tokenVersion: 1,
        assignmentId: "assignment-1",
        session: {
          tokenVersion: 1,
          assignmentId: "assignment-1",
          memberId: "member-active",
        },
        activeMemberIds: ["member-active"],
        excludedMemberIds: ["member-excluded"],
      }),
    ).toBe(true);
  });

  it("mantiene habilitado a un integrante activo aunque la distribución aún esté vacía", () => {
    expect(
      portalAcceptsPublicSession({
        enabled: true,
        tokenVersion: 1,
        assignmentId: "assignment-new",
        session: {
          tokenVersion: 1,
          assignmentId: "assignment-new",
          memberId: "member-active",
        },
        activeMemberIds: ["member-active"],
        excludedMemberIds: [],
      }),
    ).toBe(true);
  });

  it.each([
    { excludedMemberIds: ["member-active"] },
    { activeMemberIds: [] },
    { tokenVersion: 2 },
    { assignmentId: "assignment-2" },
    { enabled: false },
  ])("rechaza solamente una sesión realmente inválida: $input", (override) => {
    expect(
      portalAcceptsPublicSession({
        enabled: true,
        tokenVersion: 1,
        assignmentId: "assignment-1",
        session: {
          tokenVersion: 1,
          assignmentId: "assignment-1",
          memberId: "member-active",
        },
        activeMemberIds: ["member-active"],
        excludedMemberIds: ["member-excluded"],
        ...override,
      }),
    ).toBe(false);
  });

  it("firma una sesión limitada y rechaza una sesión expirada", async () => {
    const data = {
      portalId: "p",
      assignmentId: "a",
      memberId: "m",
      tokenVersion: 2,
      csrf: "csrf",
    };
    const valid = await signPublicSubmissionToken(
      data,
      new Date(Date.now() + 60_000),
    );
    expect(await verifyPublicSubmissionToken(valid)).toEqual(data);
    const expired = await signPublicSubmissionToken(
      data,
      new Date(Date.now() - 1_000),
    );
    expect(await verifyPublicSubmissionToken(expired)).toBeNull();
  });
});
