import { useMutation } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { loginAction } from '../../../../redux/action/authAction';
import authService from '../../../../service/authService';

export const useLoginUser = () => {
    const dispatch = useDispatch();

    return useMutation({
        mutationFn: (payload) => authService.loginUser(payload),
        onError: (err) => {
            console.log("Failed " + err);
        },
        onSuccess: (response) => {
            if (response.status) {
                dispatch(loginAction(response.data));
            } else {
                console.error(response.message || "Failed to create user.");
            }
        },
    });
};
