import { extractErrorMessage } from "@/shared/utils/errorUtils";
import type { LoginFormErrors, LoginFormState } from "@appTypes/auth.types";
import { useAuthRepository } from "@repository/authRepository";
import { useAppDispatch } from "@store/hooks";
import { addToast, setSession } from "@store/index";
import { useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";

export const useLoginViewModel = () => {
  const dispatch = useAppDispatch();
  const { login, loginState, clearLoginError } = useAuthRepository();

  const loginError = useMemo(
    () => (loginState.error ? extractErrorMessage(loginState.error) : null),
    [loginState.error],
  );

  const {
    setValue,
    trigger,
    watch,
    reset,
    handleSubmit: rhfHandleSubmit,
    formState: { errors: formErrors, touchedFields, isSubmitting },
  } = useForm<LoginFormState>({
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const validateField = useCallback(
    async (field: keyof LoginFormState) => {
      await trigger(field);
    },
    [trigger],
  );

  const handleChange = useCallback(
    (field: keyof LoginFormState) => (value: string) => {
      setValue(field, value, { shouldDirty: true, shouldTouch: true });
    },
    [setValue],
  );

  const handleBlur = useCallback(
    (field: keyof LoginFormState) => async () => {
      await validateField(field);
    },
    [validateField],
  );

  const onSubmit = useCallback(
    async (formValues: LoginFormState) => {
      try {
        const response = await login({
          email: formValues.email,
          password: formValues.password,
        });

        dispatch(setSession(response.result));

        dispatch(
          addToast({
            type: "success",
            message: response.message ?? "Login successful!",
          }),
        );
      } catch (err: unknown) {
        dispatch(
          addToast({
            type: "error",
            message: extractErrorMessage(
              err,
              "Login failed. Please try again.",
            ),
          }),
        );
      }
    },
    [login, dispatch],
  );

  const handleSubmit = useCallback(async () => {
    await rhfHandleSubmit(onSubmit)();
  }, [rhfHandleSubmit, onSubmit]);

  const resetForm = useCallback(() => {
    reset({ email: "", password: "" });
  }, [reset]);

  return {
    values: watch(),
    errors: {
      email: formErrors.email?.message,
      password: formErrors.password?.message,
    } as Partial<LoginFormErrors>,
    touched: {
      email: !!touchedFields.email,
      password: !!touchedFields.password,
    },
    handleChange,
    handleBlur,
    handleSubmit,
    resetForm,
    isLoading: loginState.isLoading || isSubmitting,
    loginError,
    clearLoginError,
  };
};
