import { Button, Center, Paper, PasswordInput, Stack, TextInput, Title, Alert } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function LoginPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('POST', '/auth/login', { email, password });
      await qc.invalidateQueries();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center h="100vh" p="md">
      <Paper withBorder p="xl" w={360} shadow="sm">
        <form onSubmit={submit}>
          <Stack>
            <Title order={3}>{t('app.title')}</Title>
            {error && <Alert color="red">{t('login.failed')}</Alert>}
            <TextInput label={t('login.email')} type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required autoFocus />
            <PasswordInput label={t('login.password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
            <Button type="submit" loading={busy}>{t('login.submit')}</Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
