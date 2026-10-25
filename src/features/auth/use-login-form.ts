import { useRef, useState } from 'react';

import { getUserMessage, toAppError } from '@/core/errors';

import { useAuth } from './auth-context';
import type { LoginFieldErrors } from './validation';

export function useLoginForm() {
  const { signIn } = useAuth();
  const [email, setEmailValue] = useState('');
  const [password, setPasswordValue] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const setEmail = (value: string) => {
    setEmailValue(value);
    setFieldErrors((e) => ({ ...e, email: undefined }));
    setFormError(null);
  };
  const setPassword = (value: string) => {
    setPasswordValue(value);
    setFieldErrors((e) => ({ ...e, password: undefined }));
    setFormError(null);
  };

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      await signIn({ email, password });
      // On success the navigator swaps to the protected stack and this screen unmounts.
    } catch (raw) {
      const error = toAppError(raw);
      const { email: emailError, password: passwordError } = error.fieldErrors ?? {};
      if (error.code === 'validation' && (emailError || passwordError)) {
        setFieldErrors({ email: emailError, password: passwordError });
      } else {
        setFormError(getUserMessage(error));
      }
      // Never keep a rejected password around in the field.
      setPasswordValue('');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return { email, password, setEmail, setPassword, fieldErrors, formError, submitting, submit };
}
