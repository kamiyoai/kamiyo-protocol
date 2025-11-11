import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function Docs() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/api-docs');
  }, [router]);

  return null;
}
