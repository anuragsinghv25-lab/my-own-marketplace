import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

/** Shared email frame in the Orbita look: soft grey page, white card, indigo accent. */
export const colors = {
  bg: '#f5f5f7',
  card: '#ffffff',
  ink: '#1d1d1f',
  mute: '#6e6e73',
  line: '#e5e5ea',
  accent: '#4f46e5',
  ai: '#7e3ad1',
};

export function EmailLayout({
  preview,
  marketplace,
  children,
}: {
  preview: string;
  marketplace: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.bg,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          margin: 0,
          padding: '32px 0',
        }}
      >
        <Container style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
          <Section style={{ paddingBottom: 16 }}>
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: `linear-gradient(135deg, ${colors.accent}, ${colors.ai})`,
                      color: '#fff',
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    ◉
                  </td>
                  <td style={{ paddingLeft: 10, fontSize: 17, fontWeight: 600, color: colors.ink }}>{marketplace}</td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.line}`,
              borderRadius: 18,
              padding: '28px 28px 24px',
            }}
          >
            {children}
          </Section>
          <Text style={{ color: colors.mute, fontSize: 12, lineHeight: '18px', marginTop: 16 }}>
            AI recommends. {marketplace} validates. Humans review exceptions.
            <br />
            You received this email because someone used this address on {marketplace}. If that wasn&apos;t you, you
            can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const h1 = { fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: colors.ink, margin: '0 0 8px' };
export const p = { fontSize: 15, lineHeight: '24px', color: colors.ink, margin: '0 0 14px' };
export const muted = { fontSize: 13, lineHeight: '20px', color: colors.mute, margin: '14px 0 0' };
export const button = {
  backgroundColor: colors.accent,
  color: '#ffffff',
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 600,
  padding: '12px 22px',
  textDecoration: 'none',
  display: 'inline-block',
};
