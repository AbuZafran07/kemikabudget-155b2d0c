import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
  showRequirements?: boolean;
}

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'Minimal 8 karakter', test: (p) => p.length >= 8 },
  { label: 'Huruf kapital (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'Huruf kecil (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'Angka (0-9)', test: (p) => /\d/.test(p) },
  { label: 'Karakter spesial (!@#$%^&*)', test: (p) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~]/.test(p) },
];

export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  PASSWORD_REQUIREMENTS.forEach((req) => {
    if (!req.test(password)) {
      errors.push(req.label);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function PasswordStrength({ password, showRequirements = true }: PasswordStrengthProps) {
  const analysis = useMemo(() => {
    const passedCount = PASSWORD_REQUIREMENTS.filter((req) => req.test(password)).length;
    const percentage = (passedCount / PASSWORD_REQUIREMENTS.length) * 100;
    
    let strength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
    let color = 'bg-destructive';
    let label = 'Lemah';

    if (passedCount >= 5) {
      strength = 'strong';
      color = 'bg-success';
      label = 'Kuat';
    } else if (passedCount >= 4) {
      strength = 'good';
      color = 'bg-primary';
      label = 'Baik';
    } else if (passedCount >= 3) {
      strength = 'fair';
      color = 'bg-warning';
      label = 'Cukup';
    }

    return {
      passedCount,
      percentage,
      strength,
      color,
      label,
      requirements: PASSWORD_REQUIREMENTS.map((req) => ({
        ...req,
        passed: req.test(password),
      })),
    };
  }, [password]);

  if (!password) return null;

  return (
    <div className="space-y-3">
      {/* Strength Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Kekuatan password</span>
          <span
            className={cn(
              'font-medium',
              analysis.strength === 'strong' && 'text-success',
              analysis.strength === 'good' && 'text-primary',
              analysis.strength === 'fair' && 'text-warning',
              analysis.strength === 'weak' && 'text-destructive'
            )}
          >
            {analysis.label}
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', analysis.color)}
            style={{ width: `${analysis.percentage}%` }}
          />
        </div>
      </div>

      {/* Requirements List */}
      {showRequirements && (
        <ul className="space-y-1.5">
          {analysis.requirements.map((req, idx) => (
            <li
              key={idx}
              className={cn(
                'flex items-center gap-2 text-sm transition-colors',
                req.passed ? 'text-success' : 'text-muted-foreground'
              )}
            >
              {req.passed ? (
                <Check className="h-4 w-4 flex-shrink-0" />
              ) : (
                <X className="h-4 w-4 flex-shrink-0" />
              )}
              <span>{req.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
