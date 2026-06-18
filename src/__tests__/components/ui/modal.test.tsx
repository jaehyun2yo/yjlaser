import { render, screen } from '@testing-library/react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '@/components/ui/modal';

describe('Modal', () => {
  test('renders when open', () => {
    render(
      <Modal open>
        <ModalContent showCloseButton={false}>
          <ModalHeader>
            <ModalTitle>Test Title</ModalTitle>
            <ModalDescription>Test Description</ModalDescription>
          </ModalHeader>
          <ModalBody>Body content</ModalBody>
          <ModalFooter>Footer content</ModalFooter>
        </ModalContent>
      </Modal>
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  test('does not render content when closed', () => {
    render(
      <Modal open={false}>
        <ModalContent>
          <ModalBody>Hidden content</ModalBody>
        </ModalContent>
      </Modal>
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });
});
