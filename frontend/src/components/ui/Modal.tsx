import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  description?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'success' | 'warning' | 'error';
  loading?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  showCloseButton = true,
  size = 'md',
  footer,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
}) => {
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className={`w-full ${sizeClasses[size]} transform overflow-hidden rounded-xl bg-white p-6 text-left align-middle shadow-xl transition-all`}>
                {showCloseButton && (
                  <button
                    type="button"
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                    onClick={onClose}
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}

                {title && (
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-2">
                    {title}
                  </Dialog.Title>
                )}

                {description && (
                  <div className="mt-2 mb-4">
                    <p className="text-sm text-gray-500">
                      {description}
                    </p>
                  </div>
                )}

                <div className="mt-4">
                  {children}
                </div>

                {(footer || onConfirm || onCancel) && (
                  <div className="mt-6 flex justify-end space-x-3">
                    {footer ? (
                      footer
                    ) : (
                      <>
                        {(onCancel !== undefined || onClose !== undefined) && (
                          <Button
                            variant="secondary"
                            onClick={handleCancel}
                            disabled={loading}
                          >
                            {cancelText}
                          </Button>
                        )}
                        {onConfirm && (
                          <Button
                            variant={confirmVariant}
                            onClick={onConfirm}
                            loading={loading}
                          >
                            {confirmText}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

