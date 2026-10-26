import { Button, Link, Text } from '@react-email/components';
import { EmailLayout, button, colors, h1, muted, p } from './layout';

export function InviteEmail(props: {
  marketplace: string;
  inviteeName: string;
  inviterName: string;
  roleLabels: string[];
  url: string;
}) {
  return (
    <EmailLayout marketplace={props.marketplace} preview={`${props.inviterName} invited you to ${props.marketplace}`}>
      <Text style={h1}>You&apos;re invited to {props.marketplace}</Text>
      <Text style={p}>
        Hi {props.inviteeName}, {props.inviterName} has given you access as{' '}
        <strong>{props.roleLabels.join(', ')}</strong>.
      </Text>
      <Text style={p}>Accept the invite to set your password and sign in.</Text>
      <Button href={props.url} style={button}>
        Accept invite
      </Button>
      <Text style={muted}>
        This link works once and expires in 24 hours. If the button does not work, paste this into your browser:
        <br />
        <Link href={props.url} style={{ color: colors.accent, wordBreak: 'break-all' }}>
          {props.url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export function SignInLinkEmail(props: { marketplace: string; url: string }) {
  return (
    <EmailLayout marketplace={props.marketplace} preview={`Your ${props.marketplace} sign-in link`}>
      <Text style={h1}>Sign in to {props.marketplace}</Text>
      <Text style={p}>Use this one-time link to sign in. No password needed.</Text>
      <Button href={props.url} style={button}>
        Sign in
      </Button>
      <Text style={muted}>The link works once and expires in 1 hour.</Text>
    </EmailLayout>
  );
}

export function ResetPasswordEmail(props: { marketplace: string; url: string }) {
  return (
    <EmailLayout marketplace={props.marketplace} preview={`Reset your ${props.marketplace} password`}>
      <Text style={h1}>Reset your password</Text>
      <Text style={p}>Someone asked to reset the password for this account. If it was you, choose a new one:</Text>
      <Button href={props.url} style={button}>
        Choose a new password
      </Button>
      <Text style={muted}>The link works once and expires in 1 hour. If you did not ask for this, ignore this email.</Text>
    </EmailLayout>
  );
}
