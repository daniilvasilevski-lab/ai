import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'next-i18next';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/store/auth';

const registerSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ 
  onSuccess, 
  onSwitchToLogin 
}) => {
  const { t } = useTranslation('common');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register: registerUser, isLoading } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      const { confirmPassword, ...registerData } = data;
      await registerUser({ ...registerData, confirmPassword });
      onSuccess?.();
    } catch (error: any) {
      if (error.response?.status === 409) {
        setError('email', { message: 'Email already exists' });
      } else {
        setError('email', { message: error.message || 'Registration failed' });
      }
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900">
          {t('register')}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Create your account
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            {...register('firstName')}
            type="text"
            label="First Name"
            placeholder="Enter your first name"
            leftIcon={<User className="h-5 w-5" />}
            error={errors.firstName?.message}
            disabled={isLoading}
            fullWidth={false}
          />

          <Input
            {...register('lastName')}
            type="text"
            label="Last Name"
            placeholder="Enter your last name"
            leftIcon={<User className="h-5 w-5" />}
            error={errors.lastName?.message}
            disabled={isLoading}
            fullWidth={false}
          />
        </div>

        <Input
          {...register('email')}
          type="email"
          label="Email"
          placeholder="Enter your email"
          leftIcon={<Mail className="h-5 w-5" />}
          error={errors.email?.message}
          disabled={isLoading}
        />

        <div className="relative">
          <Input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="Enter your password"
            leftIcon={<Lock className="h-5 w-5" />}
            error={errors.password?.message}
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="relative">
          <Input
            {...register('confirmPassword')}
            type={showConfirmPassword ? 'text' : 'password'}
            label="Confirm Password"
            placeholder="Confirm your password"
            leftIcon={<Lock className="h-5 w-5" />}
            error={errors.confirmPassword?.message}
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            {showConfirmPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={isLoading}
          size="lg"
        >
          {t('register')}
        </Button>
      </form>

      <div className="text-center">
        <button
          type="button"
          className="text-sm text-primary-600 hover:text-primary-500 transition-colors"
          onClick={onSwitchToLogin}
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  );
};

