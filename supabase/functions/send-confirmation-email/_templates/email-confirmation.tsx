import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Button,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

interface EmailConfirmationProps {
  confirmationUrl: string
  userEmail: string
}

export const EmailConfirmationTemplate = ({
  confirmationUrl,
  userEmail,
}: EmailConfirmationProps) => (
  <Html>
    <Head />
    <Preview>Bevestig je e-mailadres voor ATAD2</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoContainer}>
          <Text style={logo}>ATAD2</Text>
        </Section>
        
        <Section style={content}>
          <Heading style={h1}>Bevestig je account</Heading>
          
          <Text style={text}>
            Hallo,
          </Text>
          
          <Text style={text}>
            Welkom bij ATAD2! Om je account te activeren en toegang te krijgen tot ons platform, 
            moet je eerst je e-mailadres bevestigen.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={confirmationUrl}>
              Bevestig mijn e-mailadres
            </Button>
          </Section>

          <Text style={text}>
            Na bevestiging kun je direct beginnen met je assessment en je ATAD2 memo genereren.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            Als je dit account niet hebt aangemaakt, kun je deze e-mail veilig negeren.
          </Text>
          
          <Text style={footer}>
            © 2024 ATAD2 • Deze e-mail is automatisch verzonden.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: '#f6f8fb',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,Helvetica,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '0',
  marginTop: '32px',
  marginBottom: '32px',
  borderRadius: '12px',
  border: '1px solid #e9eef5',
  maxWidth: '600px',
}

const logoContainer = {
  padding: '40px 40px 0 40px',
}

const logo = {
  fontSize: '28px',
  fontWeight: '700',
  color: '#1a73e8',
  margin: '0',
  textAlign: 'center' as const,
}

const content = {
  padding: '20px 40px 40px 40px',
}

const h1 = {
  color: '#0b1220',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.3',
  margin: '0 0 20px 0',
}

const text = {
  color: '#465166',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#1a73e8',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 28px',
  border: 'none',
}

const hr = {
  borderColor: '#edf1f6',
  margin: '28px 0',
}

const footer = {
  color: '#9aa3b2',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '8px 0 0 0',
}

export default EmailConfirmationTemplate